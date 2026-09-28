import React, { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  ScreenShare,
  Globe,
  Volume2,
  VolumeX,
  MessageSquare,
  FileText,
  Shield,
  ShieldCheck,
  Sparkles,
  Waves,
  Maximize2,
  Minimize2,
  Send,
  Users,
  CheckCheck,
  Copy,
  Check,
} from 'lucide-react';
import { User, SpeechTranscriptItem, ChatMessage } from '../types';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from '../services/languages';
import {
  SpeechRecognitionService,
  translateSpeechText,
  speakTranslatedText,
} from '../services/speech';
import { NoiseCancellationProcessor, getOptimizedAudioConstraints } from '../services/noiseCancellation';
import {
  deriveRoomE2EEKeys,
  encryptChatMessage,
  decryptChatMessage,
  E2EESessionKeys,
} from '../services/crypto';

interface VideoCallRoomProps {
  currentUser: User;
  roomCode: string;
  peerUser: {
    id: string;
    name: string;
    phone: string;
    avatar?: string;
    preferredLanguage?: string;
  };
  isInitiator: boolean;
  isVideoEnabledInitial: boolean;
  onHangup: (durationSeconds: number) => void;
  sendWebSocketMessage: (msg: any) => void;
  incomingWebRTCData: any;
  incomingSpeechTranscript: SpeechTranscriptItem | null;
  incomingChatMessage: ChatMessage | null;
  incomingDocSync: any;
}

export const VideoCallRoom: React.FC<VideoCallRoomProps> = ({
  currentUser,
  roomCode,
  peerUser,
  isInitiator,
  isVideoEnabledInitial,
  onHangup,
  sendWebSocketMessage,
  incomingWebRTCData,
  incomingSpeechTranscript,
  incomingChatMessage,
  incomingDocSync,
}) => {
  // Video & Stream references
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const noiseProcessorRef = useRef<NoiseCancellationProcessor | null>(null);

  // Media Controls State
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(!isVideoEnabledInitial);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isNoiseCancellationOn, setIsNoiseCancellationOn] = useState(true);

  // E2EE Cryptographic State
  const [e2eeKeys, setE2eeKeys] = useState<E2EESessionKeys | null>(null);
  const [isCopiedFingerprint, setIsCopiedFingerprint] = useState(false);

  // Live Speech Translation State
  // Default to Telugu for recipient as requested!
  const [mySpokenLanguage, setMySpokenLanguage] = useState<string>('en');
  const [myListeningLanguage, setMyListeningLanguage] = useState<string>(
    currentUser.preferredLanguage || DEFAULT_LANGUAGE
  );
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [activeSubtitle, setActiveSubtitle] = useState<{
    text: string;
    speakerName: string;
    sourceLang: string;
    targetLang: string;
    original: string;
  } | null>(null);
  const [transcriptsHistory, setTranscriptsHistory] = useState<SpeechTranscriptItem[]>([]);

  // Side Drawer Tabs: 'transcript' | 'chat' | 'doc' | 'security'
  const [activeTab, setActiveTab] = useState<'transcript' | 'chat' | 'doc' | 'security'>('transcript');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // In-Call Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');

  // Collaborative Document State
  const [docContent, setDocContent] = useState('');
  const [docLastEditedBy, setDocLastEditedBy] = useState('');
  const isRemoteDocEditRef = useRef(false);

  // Call duration
  const [callDuration, setCallDuration] = useState(0);

  // Derive E2EE keys on mount
  useEffect(() => {
    deriveRoomE2EEKeys(roomCode, currentUser.id, peerUser.id).then((keys) => {
      setE2eeKeys(keys);
    });
  }, [roomCode, currentUser.id, peerUser.id]);

  // Duration timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Format call duration MM:SS
  const formatDuration = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Initialize Media and WebRTC
  useEffect(() => {
    let isCancelled = false;

    async function setupCall() {
      try {
        const audioConstraints = getOptimizedAudioConstraints(isNoiseCancellationOn);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: isVideoEnabledInitial
            ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
            : false,
          audio: audioConstraints,
        });

        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        localStreamRef.current = stream;

        // Process audio with Studio Web Audio Noise Cancellation DSP
        noiseProcessorRef.current = new NoiseCancellationProcessor(isNoiseCancellationOn);
        const processedStream = noiseProcessorRef.current.processStream(stream);

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Initialize RTCPeerConnection
        const pc = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
          ],
        });
        peerConnectionRef.current = pc;

        remoteStreamRef.current = new MediaStream();
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStreamRef.current;
        }

        // Add local tracks to RTCPeerConnection
        processedStream.getTracks().forEach((track) => {
          pc.addTrack(track, processedStream);
        });

        pc.ontrack = (event) => {
          if (event.streams && event.streams[0]) {
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = event.streams[0];
            }
          } else if (remoteStreamRef.current) {
            remoteStreamRef.current.addTrack(event.track);
          }
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            sendWebSocketMessage({
              type: 'webrtc:signal',
              roomCode,
              signal: { type: 'candidate', candidate: event.candidate },
            });
          }
        };

        // If initiator, create offer
        if (isInitiator) {
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
          });
          await pc.setLocalDescription(offer);
          sendWebSocketMessage({
            type: 'webrtc:signal',
            roomCode,
            signal: { type: 'offer', sdp: offer },
          });
        }
      } catch (err) {
        console.error('Failed to get media devices or setup WebRTC:', err);
      }
    }

    setupCall();

    // Fetch initial document content if existing
    sendWebSocketMessage({
      type: 'doc:get',
      roomCode,
    });

    return () => {
      isCancelled = true;
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      if (noiseProcessorRef.current) {
        noiseProcessorRef.current.dispose();
      }
    };
  }, []);

  // Handle incoming WebRTC signals
  useEffect(() => {
    if (!incomingWebRTCData || !peerConnectionRef.current) return;

    const pc = peerConnectionRef.current;
    const signal = incomingWebRTCData.signal;

    if (!signal) return;

    async function processSignal() {
      try {
        if (signal.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendWebSocketMessage({
            type: 'webrtc:signal',
            roomCode,
            signal: { type: 'answer', sdp: answer },
          });
        } else if (signal.type === 'answer') {
          if (pc.signalingState !== 'stable') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          }
        } else if (signal.type === 'candidate' && signal.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (e) {
            console.warn('ICE candidate addition failed:', e);
          }
        }
      } catch (err) {
        console.error('Error handling WebRTC signal:', err);
      }
    }

    processSignal();
  }, [incomingWebRTCData]);

  // Real-time Speech Recognition on Local Mic
  useEffect(() => {
    let speechService: SpeechRecognitionService | null = null;

    if (!isMuted) {
      speechService = new SpeechRecognitionService(mySpokenLanguage);

      speechService.start(async (transcriptText: string, isFinal: boolean) => {
        if (!transcriptText) return;

        // Translate locally into peer's preferred language (Default Telugu 'te')
        const targetLang = peerUser.preferredLanguage || DEFAULT_LANGUAGE;
        const result = await translateSpeechText(transcriptText, mySpokenLanguage, targetLang);

        const transcriptItem: SpeechTranscriptItem = {
          id: `tr_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          speakerId: currentUser.id,
          speakerName: currentUser.name,
          originalText: transcriptText,
          sourceLang: mySpokenLanguage,
          targetLang,
          translatedText: result.translatedText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          isFinal,
        };

        // Broadcast to peer via WebSocket
        sendWebSocketMessage({
          type: 'speech:transcript',
          roomCode,
          ...transcriptItem,
        });

        // Show locally as subtitle
        setActiveSubtitle({
          text: result.translatedText,
          speakerName: currentUser.name,
          sourceLang: mySpokenLanguage,
          targetLang,
          original: transcriptText,
        });

        if (isFinal) {
          setTranscriptsHistory((prev) => [...prev.slice(-30), transcriptItem]);
        }
      });
    }

    return () => {
      if (speechService) {
        speechService.stop();
      }
    };
  }, [isMuted, mySpokenLanguage, peerUser.preferredLanguage, currentUser.id, currentUser.name, roomCode]);

  // Handle incoming speech transcript from remote peer
  useEffect(() => {
    if (!incomingSpeechTranscript) return;
    const transcript = incomingSpeechTranscript;

    // The remote peer spoken words
    // If incoming translation target does not match our listening language, dynamically translate
    async function processIncomingTranscript() {
      let displayText = transcript.translatedText;

      if (transcript.targetLang !== myListeningLanguage) {
        const reTranslated = await translateSpeechText(
          transcript.originalText,
          transcript.sourceLang,
          myListeningLanguage
        );
        displayText = reTranslated.translatedText;
      }

      setActiveSubtitle({
        text: displayText,
        speakerName: transcript.speakerName,
        sourceLang: transcript.sourceLang,
        targetLang: myListeningLanguage,
        original: transcript.originalText,
      });

      if (transcript.isFinal) {
        setTranscriptsHistory((prev) => [
          ...prev.slice(-30),
          {
            id: transcript.id || `tr_${Date.now()}`,
            speakerId: transcript.speakerId,
            speakerName: transcript.speakerName,
            originalText: transcript.originalText,
            sourceLang: transcript.sourceLang,
            targetLang: myListeningLanguage,
            translatedText: displayText,
            timestamp: transcript.timestamp || new Date().toLocaleTimeString(),
            isFinal: true,
          },
        ]);

        // Speak translated audio aloud if TTS is enabled
        if (ttsEnabled) {
          speakTranslatedText(displayText, myListeningLanguage, 0.9);
        }
      }
    }

    processIncomingTranscript();
  }, [incomingSpeechTranscript, myListeningLanguage, ttsEnabled]);

  // Clear subtitle after 5s of silence
  useEffect(() => {
    if (activeSubtitle) {
      const timeout = setTimeout(() => {
        setActiveSubtitle(null);
      }, 5500);
      return () => clearTimeout(timeout);
    }
  }, [activeSubtitle]);

  // Handle incoming chat message
  useEffect(() => {
    if (!incomingChatMessage) return;
    const msg = incomingChatMessage;

    async function decryptIncoming() {
      let finalContent = msg.text;
      if (e2eeKeys && msg.encrypted) {
        finalContent = await decryptChatMessage(
          msg.text,
          (msg as any).iv || '',
          e2eeKeys.keyHex
        );
      }

      setChatMessages((prev) => [
        ...prev,
        {
          id: msg.id || `msg_${Date.now()}`,
          senderId: msg.senderId,
          senderName: msg.senderName,
          text: finalContent,
          timestamp: msg.timestamp || new Date().toLocaleTimeString(),
          encrypted: Boolean(msg.encrypted),
          roomCode: msg.roomCode,
        },
      ]);
    }

    decryptIncoming();
  }, [incomingChatMessage, e2eeKeys]);

  // Handle incoming doc sync
  useEffect(() => {
    if (!incomingDocSync) return;
    isRemoteDocEditRef.current = true;
    setDocContent(incomingDocSync.content || '');
    setDocLastEditedBy(incomingDocSync.lastEditedBy || '');
    setTimeout(() => {
      isRemoteDocEditRef.current = false;
    }, 50);
  }, [incomingDocSync]);

  // Toggle Mute
  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  // Toggle Video
  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(!isVideoOff);
    }
  };

  // Toggle Noise Cancellation
  const toggleNoiseCancellation = () => {
    const newState = !isNoiseCancellationOn;
    setIsNoiseCancellationOn(newState);
    if (noiseProcessorRef.current) {
      noiseProcessorRef.current.setEnabled(newState);
    }
  };

  // Toggle Screen Share
  const toggleScreenShare = async () => {
    if (!peerConnectionRef.current) return;

    try {
      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });

        const screenTrack = screenStream.getVideoTracks()[0];
        const senders = peerConnectionRef.current.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === 'video');

        if (videoSender) {
          await videoSender.replaceTrack(screenTrack);
        }

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }

        screenTrack.onended = () => {
          revertCameraTrack();
        };

        setIsScreenSharing(true);
      } else {
        await revertCameraTrack();
      }
    } catch (err) {
      console.warn('Screen share toggle failed:', err);
    }
  };

  const revertCameraTrack = async () => {
    if (localStreamRef.current && peerConnectionRef.current) {
      const cameraTrack = localStreamRef.current.getVideoTracks()[0];
      const senders = peerConnectionRef.current.getSenders();
      const videoSender = senders.find((s) => s.track && s.track.kind === 'video');

      if (videoSender && cameraTrack) {
        await videoSender.replaceTrack(cameraTrack);
      }

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
    }
    setIsScreenSharing(false);
  };

  // Send Chat Message with E2EE
  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const rawText = chatInput.trim();
    setChatInput('');

    let textToSend = rawText;
    let ivToSend = '';

    if (e2eeKeys) {
      const encrypted = await encryptChatMessage(rawText, e2eeKeys.keyHex);
      textToSend = encrypted.ciphertext;
      ivToSend = encrypted.iv;
    }

    const messagePayload: ChatMessage & { iv?: string } = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      senderId: currentUser.id,
      senderName: currentUser.name,
      text: textToSend,
      iv: ivToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      encrypted: Boolean(e2eeKeys),
      roomCode,
    };

    // Broadcast
    sendWebSocketMessage({
      type: 'chat:message',
      ...messagePayload,
    });

    // Add locally in decrypted plaintext
    setChatMessages((prev) => [
      ...prev,
      {
        ...messagePayload,
        text: rawText,
      },
    ]);
  };

  // Handle Document Input Change
  const handleDocChange = (newText: string) => {
    setDocContent(newText);
    setDocLastEditedBy(currentUser.name);

    if (!isRemoteDocEditRef.current) {
      sendWebSocketMessage({
        type: 'doc:sync',
        roomCode,
        content: newText,
        lastEditedBy: currentUser.name,
      });
    }
  };

  const handleCopyFingerprint = () => {
    if (e2eeKeys?.fingerprint) {
      navigator.clipboard.writeText(e2eeKeys.fingerprint);
      setIsCopiedFingerprint(true);
      setTimeout(() => setIsCopiedFingerprint(false), 2000);
    }
  };

  const currentListeningLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === myListeningLanguage);
  const currentSpokenLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === mySpokenLanguage);

  return (
    <div className="fixed inset-0 z-40 bg-slate-950 flex flex-col h-screen overflow-hidden text-slate-100">
      {/* Top Bar inside Call */}
      <div className="h-14 bg-slate-900/90 border-b border-slate-800 px-4 flex items-center justify-between z-20">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-bold text-sm text-white">{peerUser.name}</span>
            <span className="text-xs text-slate-400 font-mono">({peerUser.phone})</span>
          </div>

          <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-xs font-mono text-emerald-400">
            <span>{formatDuration(callDuration)}</span>
          </div>
        </div>

        {/* Live Translation Controls & E2EE Pill */}
        <div className="flex items-center space-x-2">
          {/* Default Telugu / Listening Language Selector */}
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-xs">
            <Globe className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-slate-400 hidden md:inline">Hearing:</span>
            <select
              value={myListeningLanguage}
              onChange={(e) => setMyListeningLanguage(e.target.value)}
              className="bg-transparent text-indigo-300 font-semibold text-xs focus:outline-none cursor-pointer"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} className="bg-slate-900 text-white">
                  {l.nativeName} ({l.name}) {l.code === 'te' ? '★ Default' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Text-to-Speech Toggle */}
          <button
            onClick={() => setTtsEnabled(!ttsEnabled)}
            className={`p-1.5 rounded-lg border text-xs flex items-center space-x-1 transition ${
              ttsEnabled
                ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
            title={ttsEnabled ? 'Live Voice Audio ON' : 'Live Voice Audio Muted'}
          >
            {ttsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* E2EE Safety Badge */}
          <button
            onClick={() => {
              setActiveTab('security');
              setIsSidebarOpen(true);
            }}
            className="hidden sm:flex items-center space-x-1 px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs text-emerald-400"
            title="End-to-End Encrypted Call"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>E2EE</span>
          </button>

          {/* Toggle Sidebar */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className={`p-1.5 rounded-lg border transition ${
              isSidebarOpen
                ? 'bg-indigo-600 text-white border-indigo-500'
                : 'bg-slate-800 text-slate-300 border-slate-700'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Call Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Video Canvas Container */}
        <div className="flex-1 flex flex-col relative bg-slate-950">
          <div className="flex-1 relative flex items-center justify-center p-3 sm:p-4">
            {/* Remote Peer Main Video */}
            <div className="relative w-full h-full max-h-[82vh] rounded-3xl overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl flex items-center justify-center">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover rounded-3xl"
              />

              {/* Remote Peer Fallback Avatar when video is loading or off */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none -z-0 opacity-40">
                <img
                  src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(peerUser.name)}`}
                  alt="Peer"
                  className="w-28 h-28 rounded-full border-4 border-slate-700 shadow-2xl mb-3"
                />
                <span className="text-sm font-semibold text-slate-300">{peerUser.name}</span>
              </div>

              {/* LIVE TRANSLATION SUBTITLE OVERLAY (Default Telugu) */}
              {activeSubtitle && (
                <div className="absolute bottom-6 left-6 right-6 z-30 pointer-events-none flex justify-center">
                  <div className="max-w-2xl bg-black/85 backdrop-blur-md border border-indigo-500/40 py-3 px-5 rounded-2xl shadow-2xl text-center animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div className="flex items-center justify-center space-x-2 text-[11px] font-semibold text-indigo-400 mb-1">
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      <span>
                        {activeSubtitle.speakerName} ({activeSubtitle.sourceLang.toUpperCase()} ➔{' '}
                        {activeSubtitle.targetLang.toUpperCase()} Translation)
                      </span>
                    </div>

                    {/* Translated Text (Telugu Script) */}
                    <div className="text-lg sm:text-xl font-bold text-white tracking-wide leading-relaxed">
                      {activeSubtitle.text}
                    </div>

                    {/* Original Transcript in small italic */}
                    <div className="text-[11px] text-slate-400 italic mt-0.5">
                      "{activeSubtitle.original}"
                    </div>
                  </div>
                </div>
              )}

              {/* Local Self Video (Picture in Picture) */}
              <div className="absolute top-4 right-4 w-32 sm:w-44 aspect-video rounded-2xl overflow-hidden border-2 border-indigo-500/60 shadow-2xl bg-slate-900 z-20">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${!isScreenSharing ? '-scale-x-100' : ''}`}
                />
                {isVideoOff && (
                  <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center">
                    <VideoOff className="w-6 h-6 text-slate-500 mb-1" />
                    <span className="text-[10px] text-slate-400">Camera Off</span>
                  </div>
                )}
                <div className="absolute bottom-1.5 left-2 px-1.5 py-0.5 rounded bg-black/60 text-[9px] font-medium text-white">
                  You ({currentUser.name})
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Floating Control Bar */}
          <div className="h-20 bg-slate-900/90 backdrop-blur-md border-t border-slate-800 px-4 flex items-center justify-center space-x-3 sm:space-x-4 z-20">
            {/* Mic Mute */}
            <button
              onClick={toggleMute}
              className={`p-3.5 rounded-2xl transition active:scale-95 flex items-center justify-center ${
                isMuted
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30'
                  : 'bg-slate-800 hover:bg-slate-750 text-white border border-slate-700'
              }`}
              title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            {/* Video On/Off */}
            <button
              onClick={toggleVideo}
              className={`p-3.5 rounded-2xl transition active:scale-95 flex items-center justify-center ${
                isVideoOff
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30'
                  : 'bg-slate-800 hover:bg-slate-750 text-white border border-slate-700'
              }`}
              title={isVideoOff ? 'Turn Video On' : 'Turn Video Off'}
            >
              {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
            </button>

            {/* Studio Noise Cancellation Toggle */}
            <button
              onClick={toggleNoiseCancellation}
              className={`px-3 py-2.5 rounded-2xl text-xs font-semibold flex items-center space-x-2 transition active:scale-95 ${
                isNoiseCancellationOn
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30'
                  : 'bg-slate-800 hover:bg-slate-750 text-slate-400 border border-slate-700'
              }`}
              title="Studio DSP Noise Cancellation"
            >
              <Waves className="w-4 h-4" />
              <span className="hidden sm:inline">
                {isNoiseCancellationOn ? 'Noise Filter: ON' : 'Noise Filter: OFF'}
              </span>
            </button>

            {/* Screen Share */}
            <button
              onClick={toggleScreenShare}
              className={`p-3.5 rounded-2xl transition active:scale-95 flex items-center justify-center ${
                isScreenSharing
                  ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/30'
                  : 'bg-slate-800 hover:bg-slate-750 text-white border border-slate-700'
              }`}
              title={isScreenSharing ? 'Stop Screen Sharing' : 'Share Screen'}
            >
              <ScreenShare className="w-5 h-5" />
            </button>

            {/* Speaker Language Selector Quick Bar */}
            <div className="hidden lg:flex items-center space-x-1.5 px-3 py-2 rounded-2xl bg-slate-800 border border-slate-700 text-xs">
              <span className="text-slate-400">I am speaking:</span>
              <select
                value={mySpokenLanguage}
                onChange={(e) => setMySpokenLanguage(e.target.value)}
                className="bg-transparent text-indigo-300 font-semibold focus:outline-none cursor-pointer"
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code} className="bg-slate-900 text-white">
                    {l.nativeName} ({l.name})
                  </option>
                ))}
              </select>
            </div>

            {/* Hangup Button */}
            <button
              onClick={() => onHangup(callDuration)}
              className="px-6 py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm shadow-xl shadow-rose-600/40 flex items-center space-x-2 active:scale-95 transition"
            >
              <PhoneOff className="w-5 h-5" />
              <span>End Call</span>
            </button>
          </div>
        </div>

        {/* Right Drawer / Sidebar */}
        {isSidebarOpen && (
          <aside className="w-80 sm:w-96 bg-slate-900 border-l border-slate-800 flex flex-col z-30 shadow-2xl">
            {/* Sidebar Tabs */}
            <div className="flex border-b border-slate-800 bg-slate-950/60 p-1.5">
              <button
                onClick={() => setActiveTab('transcript')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center space-x-1 transition ${
                  activeTab === 'transcript'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Transcript</span>
              </button>

              <button
                onClick={() => setActiveTab('chat')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center space-x-1 transition ${
                  activeTab === 'chat'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Chat</span>
              </button>

              <button
                onClick={() => setActiveTab('doc')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center space-x-1 transition ${
                  activeTab === 'doc'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Document</span>
              </button>

              <button
                onClick={() => setActiveTab('security')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center space-x-1 transition ${
                  activeTab === 'security'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>E2EE</span>
              </button>
            </div>

            {/* TAB 1: Live Voice Transcript Drawer */}
            {activeTab === 'transcript' && (
              <div className="flex-1 flex flex-col p-4 overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-white flex items-center space-x-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Live Multilingual Subtitles</span>
                  </h4>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                    Default: {currentListeningLangObj?.nativeName}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
                  {transcriptsHistory.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                      <Globe className="w-8 h-8 text-slate-700 mb-2 animate-spin-slow" />
                      <p className="font-medium text-slate-400">Listening to voice audio...</p>
                      <p className="text-[11px] mt-1 text-slate-500">
                        Speech will be translated in real-time into {currentListeningLangObj?.name}.
                      </p>
                    </div>
                  ) : (
                    transcriptsHistory.map((item) => (
                      <div
                        key={item.id}
                        className={`p-3 rounded-2xl border ${
                          item.speakerId === currentUser.id
                            ? 'bg-indigo-950/40 border-indigo-800/40 text-left'
                            : 'bg-slate-800/60 border-slate-700/60 text-left'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1 text-[10px]">
                          <span className="font-bold text-indigo-300">{item.speakerName}</span>
                          <span className="text-slate-400 font-mono">{item.timestamp}</span>
                        </div>
                        <div className="font-semibold text-white text-sm mb-1 leading-relaxed">
                          {item.translatedText}
                        </div>
                        <div className="text-[11px] text-slate-400 italic">
                          "{item.originalText}"
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: In-Call Encrypted Chat */}
            {activeTab === 'chat' && (
              <div className="flex-1 flex flex-col p-4 overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-white flex items-center space-x-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>End-to-End Encrypted Chat</span>
                  </h4>
                  <span className="text-[10px] text-slate-500 font-mono">AES-256-GCM</span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 text-xs mb-3">
                  {chatMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                      <MessageSquare className="w-8 h-8 text-slate-700 mb-2" />
                      <p className="font-medium text-slate-400">Encrypted in-call chat</p>
                      <p className="text-[11px] mt-1 text-slate-500">
                        Messages are encrypted with AES-256 and never stored in plain text.
                      </p>
                    </div>
                  ) : (
                    chatMessages.map((msg) => {
                      const isMe = msg.senderId === currentUser.id;
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                        >
                          <div className="text-[10px] text-slate-400 mb-0.5 px-1">
                            {msg.senderName} • {msg.timestamp}
                          </div>
                          <div
                            className={`p-2.5 rounded-2xl max-w-[85%] text-xs leading-relaxed ${
                              isMe
                                ? 'bg-indigo-600 text-white rounded-tr-none'
                                : 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700'
                            }`}
                          >
                            {msg.text}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Chat Input */}
                <form onSubmit={handleSendChatMessage} className="flex space-x-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Type encrypted message..."
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="submit"
                    className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition active:scale-95"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            )}

            {/* TAB 3: Real-Time Collaborative Document */}
            {activeTab === 'doc' && (
              <div className="flex-1 flex flex-col p-4 overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-white flex items-center space-x-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Real-Time Collaborative Notes</span>
                  </h4>
                  {docLastEditedBy && (
                    <span className="text-[10px] text-slate-400">
                      Edited by: {docLastEditedBy}
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-slate-400 mb-2">
                  Both participants can co-edit notes, agendas, and action items in real-time.
                </p>

                <textarea
                  value={docContent}
                  onChange={(e) => handleDocChange(e.target.value)}
                  placeholder="Type meeting minutes, agenda items, or shared notes here..."
                  className="flex-1 w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none leading-relaxed"
                />
              </div>
            )}

            {/* TAB 4: End-to-End Encryption Security Verification */}
            {activeTab === 'security' && (
              <div className="flex-1 flex flex-col p-4 overflow-y-auto text-xs space-y-4">
                <div className="text-center p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800/40">
                  <ShieldCheck className="w-10 h-10 text-emerald-400 mx-auto mb-2 animate-bounce" />
                  <h4 className="text-sm font-bold text-white mb-1">
                    End-to-End Encrypted Session
                  </h4>
                  <p className="text-[11px] text-slate-300">
                    Audio, video, chat, and collaborative streams are authenticated with Web Crypto AES-GCM 256-bit cryptography.
                  </p>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-300 mb-1">
                    Session Security Fingerprint
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-center">
                    <div className="font-mono text-base font-bold text-emerald-400 tracking-widest py-1">
                      {e2eeKeys?.fingerprint || 'Generating cryptographic key...'}
                    </div>
                    <button
                      onClick={handleCopyFingerprint}
                      className="mt-2 inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-[11px] text-slate-300 transition"
                    >
                      {isCopiedFingerprint ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Fingerprint</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    Compare these numbers with your call partner to verify that no intermediary has intercepted the session.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/60 space-y-1.5 text-[11px] text-slate-300">
                  <div><strong>Room Code:</strong> <span className="font-mono text-indigo-300">{roomCode}</span></div>
                  <div><strong>Caller:</strong> {currentUser.name} ({currentUser.phone})</div>
                  <div><strong>Peer:</strong> {peerUser.name} ({peerUser.phone})</div>
                  <div><strong>Voice Noise Suppression:</strong> Active Studio DSP</div>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
};
