import React, { useState } from 'react';
import { X, Link2, Copy, Check, Video, Share2, Sparkles, ShieldCheck } from 'lucide-react';

interface ShareMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoinMeetingRoom: (roomCode: string) => void;
}

export const ShareMeetingModal: React.FC<ShareMeetingModalProps> = ({
  isOpen,
  onClose,
  onJoinMeetingRoom,
}) => {
  const [roomCode] = useState(() => `meet_${Math.random().toString(36).substring(2, 8)}`);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const meetingUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}?room=${roomCode}`
    : `https://telcall.app/?room=${roomCode}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(meetingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleJoin = () => {
    onJoinMeetingRoom(roomCode);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl p-6 shadow-2xl text-slate-100 relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center mb-4">
          <Link2 className="w-6 h-6" />
        </div>

        <h3 className="text-lg font-bold text-white mb-1">
          Instant Collaborative Meeting
        </h3>
        <p className="text-xs text-slate-400 mb-5 leading-relaxed">
          Invite anyone to join this video conference directly without dialing a phone number. Includes live Telugu translation, screen sharing, and collaborative document editing.
        </p>

        {/* Link Box */}
        <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between mb-4">
          <div className="truncate text-xs font-mono text-indigo-300 pr-2 select-all">
            {meetingUrl}
          </div>
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-xs font-semibold text-white flex items-center space-x-1.5 shrink-0 transition"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>

        {/* Features badges */}
        <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300 mb-6">
          <div className="flex items-center space-x-2 p-2 rounded-xl bg-slate-800/40">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Live Voice Translation</span>
          </div>
          <div className="flex items-center space-x-2 p-2 rounded-xl bg-slate-800/40">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>End-to-End Encrypted</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex space-x-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold transition"
          >
            Close
          </button>
          <button
            onClick={handleJoin}
            className="flex-1 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 flex items-center justify-center space-x-2 transition"
          >
            <Video className="w-4 h-4" />
            <span>Start Room Now</span>
          </button>
        </div>
      </div>
    </div>
  );
};
