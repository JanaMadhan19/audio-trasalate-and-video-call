import React, { useEffect, useRef } from 'react';
import { Phone, Video, PhoneOff, PhoneCall, ShieldCheck } from 'lucide-react';

interface IncomingCallModalProps {
  callerName: string;
  callerPhone: string;
  roomCode: string;
  isVideo: boolean;
  onAccept: (withVideo: boolean) => void;
  onDecline: () => void;
}

export const IncomingCallModal: React.FC<IncomingCallModalProps> = ({
  callerName,
  callerPhone,
  isVideo,
  onAccept,
  onDecline,
}) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const ringIntervalRef = useRef<any>(null);

  // Play gentle Web Audio API ringtone loop
  useEffect(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        audioContextRef.current = ctx;

        const playRingPulse = () => {
          if (ctx.state === 'suspended') {
            ctx.resume();
          }
          const now = ctx.currentTime;
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();

          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(440, now); // A4
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(480, now); // B4

          gain.gain.setValueAtTime(0.15, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(ctx.destination);

          osc1.start(now);
          osc2.start(now);
          osc1.stop(now + 1.2);
          osc2.stop(now + 1.2);
        };

        // Ring pulse immediately then every 2.8s
        playRingPulse();
        ringIntervalRef.current = setInterval(playRingPulse, 2800);
      }
    } catch (e) {
      console.warn('Audio ringtone playback error:', e);
    }

    return () => {
      if (ringIntervalRef.current) {
        clearInterval(ringIntervalRef.current);
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try {
          audioContextRef.current.close();
        } catch (e) {}
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="bg-slate-900 border border-slate-700/80 w-full max-w-sm rounded-3xl p-6 shadow-2xl text-center relative overflow-hidden">
        {/* Pulsing ring background ripples */}
        <div className="absolute top-12 left-1/2 -translate-x-1/2 w-32 h-32 rounded-full bg-emerald-500/20 animate-ping pointer-events-none" />
        <div className="absolute top-8 left-1/2 -translate-x-1/2 w-40 h-40 rounded-full bg-indigo-500/10 animate-pulse pointer-events-none" />

        {/* Incoming Call Header */}
        <div className="inline-flex items-center space-x-1 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-semibold mb-6">
          <PhoneCall className="w-3.5 h-3.5 animate-bounce" />
          <span>Incoming WebRTC Call</span>
        </div>

        {/* Caller Avatar */}
        <div className="relative w-24 h-24 mx-auto mb-4">
          <img
            src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(callerName)}`}
            alt={callerName}
            className="w-full h-full rounded-full border-4 border-emerald-500 object-cover shadow-xl relative z-10"
          />
        </div>

        <h3 className="text-xl font-extrabold text-white mb-1">
          {callerName}
        </h3>
        <p className="text-xs font-mono text-indigo-400 mb-2">
          {callerPhone || 'Registered TelCall User'}
        </p>

        <div className="inline-flex items-center space-x-1 text-[11px] text-emerald-400 font-medium mb-8">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>End-to-End Encrypted Session</span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-center space-x-4">
          {/* Decline */}
          <button
            onClick={onDecline}
            className="flex flex-col items-center group active:scale-95 transition"
          >
            <div className="w-14 h-14 rounded-full bg-rose-600 group-hover:bg-rose-500 flex items-center justify-center shadow-lg shadow-rose-600/40 text-white transition">
              <PhoneOff className="w-6 h-6" />
            </div>
            <span className="text-[11px] text-slate-400 font-medium mt-1.5">Decline</span>
          </button>

          {/* Accept with Video */}
          <button
            onClick={() => onAccept(true)}
            className="flex flex-col items-center group active:scale-95 transition"
          >
            <div className="w-16 h-16 rounded-full bg-emerald-600 group-hover:bg-emerald-500 flex items-center justify-center shadow-xl shadow-emerald-600/40 text-white animate-pulse transition">
              <Video className="w-7 h-7" />
            </div>
            <span className="text-xs text-white font-bold mt-1.5">Accept Video</span>
          </button>

          {/* Accept Audio Only */}
          <button
            onClick={() => onAccept(false)}
            className="flex flex-col items-center group active:scale-95 transition"
          >
            <div className="w-14 h-14 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center shadow-lg text-slate-200 transition">
              <Phone className="w-5 h-5 text-emerald-400" />
            </div>
            <span className="text-[11px] text-slate-400 font-medium mt-1.5">Audio Only</span>
          </button>
        </div>
      </div>
    </div>
  );
};
