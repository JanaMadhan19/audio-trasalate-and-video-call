import React, { useState, useEffect, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { Dialer } from './components/Dialer';
import { VideoCallRoom } from './components/VideoCallRoom';
import { IncomingCallModal } from './components/IncomingCallModal';
import { CallHistoryTab } from './components/CallHistoryTab';
import { AuthModal } from './components/AuthModal';
import { AdminDashboard } from './components/AdminDashboard';
import { ShareMeetingModal } from './components/ShareMeetingModal';
import { User, CallRecord, SpeechTranscriptItem, ChatMessage } from './types';
import { Phone, Video, PhoneOff, Sparkles, Shield, AlertCircle } from 'lucide-react';

export default function App() {
  // Current user state (persisted in localStorage)
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('telcall_user');
      if (saved) return JSON.parse(saved);
    } catch {}
    // Seed default guest user for immediate testing convenience
    return {
      id: 'usr_priya',
      name: 'Priya Sharma',
      email: 'priya@example.com',
      phone: '+1-987-654-3210',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      role: 'user',
      twoFactorEnabled: true,
      preferredLanguage: 'te', // Telugu default
      status: 'active',
      createdAt: new Date().toISOString(),
    };
  });

  // Navigation tab: 'dialer' | 'history'
  const [mainTab, setMainTab] = useState<'dialer' | 'history'>('dialer');

  // Modals state
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [shareMeetingOpen, setShareMeetingOpen] = useState(false);

  // Call History State
  const [callHistory, setCallHistory] = useState<CallRecord[]>([]);

  // WebSocket Connection
  const socketRef = useRef<WebSocket | null>(null);
  const [isWsConnected, setIsWsConnected] = useState(false);

  // Active Outgoing Ringing State
  const [outgoingCallInfo, setOutgoingCallInfo] = useState<{
    recipientId: string;
    recipientName: string;
    recipientPhone: string;
    roomCode: string;
    isVideo: boolean;
  } | null>(null);

  // Incoming Call State
  const [incomingCall, setIncomingCall] = useState<{
    callerId: string;
    callerName: string;
    callerPhone: string;
    roomCode: string;
    isVideo: boolean;
  } | null>(null);

  // In-Call Active State
  const [activeCallRoom, setActiveCallRoom] = useState<{
    roomCode: string;
    peerUser: {
      id: string;
      name: string;
      phone: string;
      avatar?: string;
      preferredLanguage?: string;
    };
    isInitiator: boolean;
    isVideo: boolean;
  } | null>(null);

  // Real-time Event Pipes for active call
  const [incomingWebRTCData, setIncomingWebRTCData] = useState<any>(null);
  const [incomingSpeechTranscript, setIncomingSpeechTranscript] = useState<SpeechTranscriptItem | null>(null);
  const [incomingChatMessage, setIncomingChatMessage] = useState<ChatMessage | null>(null);
  const [incomingDocSync, setIncomingDocSync] = useState<any>(null);
  const [callAlertBanner, setCallAlertBanner] = useState<string | null>(null);

  // Save current user to localStorage
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('telcall_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('telcall_user');
    }
  }, [currentUser]);

  // Load call history for current user
  const fetchCallHistory = () => {
    if (!currentUser) return;
    fetch(`/api/calls/history?userId=${currentUser.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.calls) {
          setCallHistory(data.calls);
        }
      })
      .catch((err) => console.warn('Call history fetch error:', err));
  };

  useEffect(() => {
    fetchCallHistory();
  }, [currentUser?.id]);

  // Check URL query parameters for meeting room link: ?room=...
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const roomParam = urlParams.get('room');
      if (roomParam && !activeCallRoom) {
        // Start or join this room
        setActiveCallRoom({
          roomCode: roomParam,
          peerUser: {
            id: 'peer_guest',
            name: 'Conference Participant',
            phone: 'Room ' + roomParam.slice(0, 8),
            avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
            preferredLanguage: 'te',
          },
          isInitiator: false,
          isVideo: true,
        });
      }
    }
  }, []);

  // Setup WebSocket Signaling Connection
  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimeout: any;

    const connectWebSocket = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;

      try {
        ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
          setIsWsConnected(true);
          if (currentUser) {
            ws.send(
              JSON.stringify({
                type: 'user:register',
                userId: currentUser.id,
                phone: currentUser.phone,
                name: currentUser.name,
              })
            );
          }
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            switch (data.type) {
              case 'call:incoming': {
                setIncomingCall({
                  callerId: data.callerId,
                  callerName: data.callerName,
                  callerPhone: data.callerPhone,
                  roomCode: data.roomCode,
                  isVideo: data.isVideo ?? true,
                });
                break;
              }

              case 'call:ringing': {
                // Outgoing call is ringing on recipient
                break;
              }

              case 'call:accepted': {
                // Callee accepted our outgoing call!
                if (outgoingCallInfo) {
                  setActiveCallRoom({
                    roomCode: data.roomCode,
                    peerUser: {
                      id: data.recipientId,
                      name: data.recipientName || outgoingCallInfo.recipientName,
                      phone: outgoingCallInfo.recipientPhone,
                      preferredLanguage: 'te',
                    },
                    isInitiator: true,
                    isVideo: outgoingCallInfo.isVideo,
                  });
                  setOutgoingCallInfo(null);
                }
                break;
              }

              case 'call:rejected': {
                setOutgoingCallInfo(null);
                setCallAlertBanner('The recipient declined your call.');
                fetchCallHistory();
                setTimeout(() => setCallAlertBanner(null), 6000);
                break;
              }

              case 'call:offline': {
                setOutgoingCallInfo(null);
                setCallAlertBanner(data.message);
                fetchCallHistory();
                setTimeout(() => setCallAlertBanner(null), 8000);
                break;
              }

              case 'call:error': {
                setOutgoingCallInfo(null);
                setCallAlertBanner(data.message);
                setTimeout(() => setCallAlertBanner(null), 6000);
                break;
              }

              case 'call:ended': {
                if (activeCallRoom) {
                  setActiveCallRoom(null);
                  setCallAlertBanner(`Call ended. Duration: ${data.durationSeconds || 0} seconds.`);
                  fetchCallHistory();
                  setTimeout(() => setCallAlertBanner(null), 4000);
                }
                break;
              }

              case 'webrtc:signal': {
                setIncomingWebRTCData(data);
                break;
              }

              case 'speech:transcript': {
                setIncomingSpeechTranscript(data);
                break;
              }

              case 'chat:message': {
                setIncomingChatMessage(data);
                break;
              }

              case 'doc:sync': {
                setIncomingDocSync(data);
                break;
              }

              default:
                break;
            }
          } catch (e) {
            console.error('Error handling WS event:', e);
          }
        };

        ws.onclose = () => {
          setIsWsConnected(false);
          reconnectTimeout = setTimeout(connectWebSocket, 3000);
        };

        ws.onerror = () => {
          setIsWsConnected(false);
        };
      } catch (err) {
        console.warn('WebSocket connection error:', err);
      }
    };

    connectWebSocket();

    return () => {
      clearTimeout(reconnectTimeout);
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [currentUser?.id]);

  const sendWebSocketMessage = (message: any) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    }
  };

  // Initiate outgoing call by phone number
  const handleInitiateCall = (
    targetUser: { id: string; name: string; phone: string; avatar?: string; preferredLanguage?: string },
    isVideo: boolean
  ) => {
    if (!currentUser) {
      setAuthModalOpen(true);
      return;
    }

    const roomCode = `room_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setOutgoingCallInfo({
      recipientId: targetUser.id,
      recipientName: targetUser.name,
      recipientPhone: targetUser.phone,
      roomCode,
      isVideo,
    });

    sendWebSocketMessage({
      type: 'call:dial',
      targetPhone: targetUser.phone,
      callerId: currentUser.id,
      callerName: currentUser.name,
      callerPhone: currentUser.phone,
      isVideo,
    });
  };

  // Cancel outgoing call
  const handleCancelOutgoingCall = () => {
    if (outgoingCallInfo) {
      sendWebSocketMessage({
        type: 'call:hangup',
        roomCode: outgoingCallInfo.roomCode,
      });
      setOutgoingCallInfo(null);
    }
  };

  // Accept incoming call
  const handleAcceptIncomingCall = (withVideo: boolean) => {
    if (!incomingCall || !currentUser) return;

    sendWebSocketMessage({
      type: 'call:accept',
      callerId: incomingCall.callerId,
      roomCode: incomingCall.roomCode,
      recipientId: currentUser.id,
    });

    setActiveCallRoom({
      roomCode: incomingCall.roomCode,
      peerUser: {
        id: incomingCall.callerId,
        name: incomingCall.callerName,
        phone: incomingCall.callerPhone,
        preferredLanguage: 'te', // Telugu default
      },
      isInitiator: false,
      isVideo: withVideo,
    });

    setIncomingCall(null);
  };

  // Decline incoming call
  const handleDeclineIncomingCall = () => {
    if (!incomingCall) return;

    sendWebSocketMessage({
      type: 'call:reject',
      callerId: incomingCall.callerId,
      callerName: incomingCall.callerName,
      callerPhone: incomingCall.callerPhone,
      recipientPhone: currentUser?.phone,
      roomCode: incomingCall.roomCode,
    });

    setIncomingCall(null);
    fetchCallHistory();
  };

  // Hangup active call
  const handleHangupActiveCall = (durationSeconds: number) => {
    if (!activeCallRoom || !currentUser) return;

    // Record call to database
    fetch('/api/calls/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callerId: currentUser.id,
        callerName: currentUser.name,
        callerPhone: currentUser.phone,
        recipientId: activeCallRoom.peerUser.id,
        recipientName: activeCallRoom.peerUser.name,
        recipientPhone: activeCallRoom.peerUser.phone,
        type: activeCallRoom.isVideo ? 'video' : 'audio',
        status: 'completed',
        durationSeconds,
        roomCode: activeCallRoom.roomCode,
      }),
    })
      .then(() => fetchCallHistory())
      .catch((e) => console.warn('Error saving call record:', e));

    sendWebSocketMessage({
      type: 'call:hangup',
      roomCode: activeCallRoom.roomCode,
      durationSeconds,
    });

    setActiveCallRoom(null);
  };

  // Update current user's preferred language
  const handleSelectLanguage = async (langCode: string) => {
    if (currentUser) {
      setCurrentUser({ ...currentUser, preferredLanguage: langCode });
      try {
        await fetch('/api/user/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: currentUser.id,
            preferredLanguage: langCode,
          }),
        });
      } catch (e) {
        console.warn('Error saving language:', e);
      }
    }
  };

  // Update phone number
  const handleUpdatePhone = (newPhone: string) => {
    if (currentUser) {
      setCurrentUser({ ...currentUser, phone: newPhone });
    }
  };

  // Mark missed calls as read
  const handleMarkAllCallsAsRead = async () => {
    if (!currentUser) return;
    try {
      await fetch('/api/calls/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id }),
      });
      fetchCallHistory();
    } catch (e) {}
  };

  // Calculate unread missed calls count
  const unreadMissedCallsCount = currentUser
    ? callHistory.filter((c) => c.recipientId === currentUser.id && c.status === 'missed' && !c.isRead).length
    : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Navigation */}
      <Navbar
        currentUser={currentUser}
        onOpenAuth={() => setAuthModalOpen(true)}
        onLogout={() => setCurrentUser(null)}
        onOpenAdmin={() => setAdminModalOpen(true)}
        onSelectLanguage={handleSelectLanguage}
        unreadMissedCallsCount={unreadMissedCallsCount}
        onOpenCallHistory={() => setMainTab('history')}
        isWsConnected={isWsConnected}
        isInCall={Boolean(activeCallRoom)}
      />

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Banner Alert (e.g. Call Ended / User Offline / Rejected) */}
        {callAlertBanner && (
          <div className="mb-6 p-4 rounded-2xl bg-indigo-950/60 border border-indigo-500/40 text-indigo-200 text-xs sm:text-sm flex items-center justify-between shadow-xl animate-in slide-in-from-top-2 duration-300">
            <div className="flex items-center space-x-2.5">
              <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
              <span>{callAlertBanner}</span>
            </div>
            <button
              onClick={() => setCallAlertBanner(null)}
              className="text-xs text-indigo-300 hover:text-white font-bold ml-4"
            >
              ✕
            </button>
          </div>
        )}

        {/* Outgoing Call Ringing Screen */}
        {outgoingCallInfo && (
          <div className="mb-8 p-8 rounded-3xl bg-gradient-to-br from-indigo-950/80 via-slate-900 to-slate-900 border border-indigo-700/50 shadow-2xl text-center relative overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="w-24 h-24 mx-auto mb-4 relative">
              <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
              <img
                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(outgoingCallInfo.recipientName)}`}
                alt="Calling"
                className="w-full h-full rounded-full border-4 border-indigo-500 object-cover shadow-2xl relative z-10"
              />
            </div>

            <div className="inline-block px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-semibold mb-2">
              Calling Registered Device...
            </div>

            <h3 className="text-xl font-extrabold text-white mb-1">
              {outgoingCallInfo.recipientName}
            </h3>
            <p className="text-sm font-mono text-indigo-400 mb-6">
              {outgoingCallInfo.recipientPhone}
            </p>

            <button
              onClick={handleCancelOutgoingCall}
              className="px-6 py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/30 inline-flex items-center space-x-2 transition"
            >
              <PhoneOff className="w-4 h-4" />
              <span>Cancel Call</span>
            </button>
          </div>
        )}

        {/* Tab Navigation (Dialer vs Call History) */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex p-1 bg-slate-900 border border-slate-800 rounded-2xl">
            <button
              onClick={() => setMainTab('dialer')}
              className={`px-5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 ${
                mainTab === 'dialer'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Phone className="w-4 h-4" />
              <span>Dial by Number</span>
            </button>

            <button
              onClick={() => setMainTab('history')}
              className={`px-5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 relative ${
                mainTab === 'history'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Video className="w-4 h-4" />
              <span>Call History</span>
              {unreadMissedCallsCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white shadow">
                  {unreadMissedCallsCount}
                </span>
              )}
            </button>
          </div>

          <div className="hidden sm:flex items-center space-x-2 text-xs text-slate-400">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>Encrypted WebRTC P2P + Gemini AI Audio Translation (Default Telugu)</span>
          </div>
        </div>

        {/* Main View Contents */}
        {mainTab === 'dialer' ? (
          <Dialer
            currentUser={currentUser}
            onInitiateCall={handleInitiateCall}
            onOpenMeetingShare={() => setShareMeetingOpen(true)}
            onPromptAuth={() => setAuthModalOpen(true)}
            onUpdatePhone={handleUpdatePhone}
          />
        ) : (
          <CallHistoryTab
            calls={callHistory}
            currentUserId={currentUser?.id || ''}
            onRedial={(phone, name) => {
              setMainTab('dialer');
              handleInitiateCall({ id: 'redial', name, phone }, true);
            }}
            onMarkAllAsRead={handleMarkAllCallsAsRead}
            onRefresh={fetchCallHistory}
          />
        )}
      </main>

      {/* Incoming Call Ringing Modal */}
      {incomingCall && (
        <IncomingCallModal
          callerName={incomingCall.callerName}
          callerPhone={incomingCall.callerPhone}
          roomCode={incomingCall.roomCode}
          isVideo={incomingCall.isVideo}
          onAccept={handleAcceptIncomingCall}
          onDecline={handleDeclineIncomingCall}
        />
      )}

      {/* Active 1-to-1 WebRTC Video Session Room */}
      {activeCallRoom && currentUser && (
        <VideoCallRoom
          currentUser={currentUser}
          roomCode={activeCallRoom.roomCode}
          peerUser={activeCallRoom.peerUser}
          isInitiator={activeCallRoom.isInitiator}
          isVideoEnabledInitial={activeCallRoom.isVideo}
          onHangup={handleHangupActiveCall}
          sendWebSocketMessage={sendWebSocketMessage}
          incomingWebRTCData={incomingWebRTCData}
          incomingSpeechTranscript={incomingSpeechTranscript}
          incomingChatMessage={incomingChatMessage}
          incomingDocSync={incomingDocSync}
        />
      )}

      {/* Auth Modal (Phone, Gmail, Social, 2FA) */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          setAuthModalOpen(false);
        }}
      />

      {/* Admin Dashboard */}
      {adminModalOpen && (
        <AdminDashboard onClose={() => setAdminModalOpen(false)} />
      )}

      {/* Instant Meeting Link Modal */}
      <ShareMeetingModal
        isOpen={shareMeetingOpen}
        onClose={() => setShareMeetingOpen(false)}
        onJoinMeetingRoom={(roomCode) => {
          if (!currentUser) {
            setAuthModalOpen(true);
            return;
          }
          setActiveCallRoom({
            roomCode,
            peerUser: {
              id: 'peer_guest',
              name: 'Invited Guest',
              phone: 'Shared Meeting Link',
              preferredLanguage: 'te',
            },
            isInitiator: true,
            isVideo: true,
          });
        }}
      />
    </div>
  );
}
