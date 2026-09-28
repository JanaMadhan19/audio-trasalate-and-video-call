import React, { useState } from 'react';
import { PhoneIncoming, PhoneOutgoing, PhoneMissed, Video, Phone, Clock, Calendar, CheckCheck, RefreshCw } from 'lucide-react';
import { CallRecord } from '../types';

interface CallHistoryTabProps {
  calls: CallRecord[];
  currentUserId: string;
  onRedial: (phone: string, name: string) => void;
  onMarkAllAsRead: () => void;
  onRefresh: () => void;
}

export const CallHistoryTab: React.FC<CallHistoryTabProps> = ({
  calls,
  currentUserId,
  onRedial,
  onMarkAllAsRead,
  onRefresh,
}) => {
  const [filter, setFilter] = useState<'all' | 'missed' | 'completed'>('all');

  const filteredCalls = calls.filter((c) => {
    if (filter === 'missed') return c.status === 'missed';
    if (filter === 'completed') return c.status === 'completed';
    return true;
  });

  const formatSeconds = (sec: number) => {
    if (!sec) return '0s';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-slate-800 gap-3">
        <div>
          <h2 className="text-base font-bold text-white flex items-center space-x-2">
            <span>Call History & Logs</span>
          </h2>
          <p className="text-xs text-slate-400">
            Incoming, outgoing, and missed call notifications
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Filters */}
          <div className="flex p-1 bg-slate-800 rounded-xl text-xs">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded-lg font-medium transition ${
                filter === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              All ({calls.length})
            </button>
            <button
              onClick={() => setFilter('missed')}
              className={`px-3 py-1 rounded-lg font-medium transition ${
                filter === 'missed' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Missed ({calls.filter((c) => c.status === 'missed').length})
            </button>
            <button
              onClick={() => setFilter('completed')}
              className={`px-3 py-1 rounded-lg font-medium transition ${
                filter === 'completed' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Answered
            </button>
          </div>

          <button
            onClick={onMarkAllAsRead}
            title="Mark all as read"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white transition"
          >
            <CheckCheck className="w-4 h-4 text-emerald-400" />
          </button>

          <button
            onClick={onRefresh}
            title="Refresh logs"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white transition"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Calls List */}
      <div className="mt-4 space-y-3">
        {filteredCalls.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            <Phone className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            <p className="font-semibold text-slate-400">No calls in this category</p>
            <p className="text-slate-500 mt-1">New incoming and outgoing sessions will appear here.</p>
          </div>
        ) : (
          filteredCalls.map((call) => {
            const isIncoming = call.recipientId === currentUserId;
            const isMissed = call.status === 'missed';
            const otherPartyName = isIncoming ? call.callerName : call.recipientName;
            const otherPartyPhone = isIncoming ? call.callerPhone : call.recipientPhone;

            return (
              <div
                key={call.id}
                className={`p-3.5 rounded-2xl border transition flex items-center justify-between ${
                  isMissed && !call.isRead
                    ? 'bg-rose-950/20 border-rose-500/40 shadow-sm'
                    : 'bg-slate-800/50 hover:bg-slate-800 border-slate-700/50'
                }`}
              >
                {/* Left: Call type icon + details */}
                <div className="flex items-center space-x-3.5">
                  <div
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                      isMissed
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : isIncoming
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                    }`}
                  >
                    {isMissed ? (
                      <PhoneMissed className="w-5 h-5 animate-pulse" />
                    ) : isIncoming ? (
                      <PhoneIncoming className="w-5 h-5" />
                    ) : (
                      <PhoneOutgoing className="w-5 h-5" />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs sm:text-sm font-bold text-white">
                        {otherPartyName}
                      </span>
                      {isMissed && !call.isRead && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-500 text-white animate-pulse">
                          Missed Alert
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-mono text-slate-400">
                      {otherPartyPhone}
                    </div>
                    <div className="flex items-center space-x-2 text-[10px] text-slate-500 mt-0.5">
                      <span>{formatDate(call.startedAt)}</span>
                      <span>•</span>
                      <span className="flex items-center space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>{isMissed ? 'No Answer' : formatSeconds(call.durationSeconds)}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Redial Button */}
                <button
                  onClick={() => onRedial(otherPartyPhone, otherPartyName)}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white text-xs font-semibold flex items-center space-x-1.5 transition active:scale-95 border border-emerald-500/30"
                  title="Call Back Now"
                >
                  <Video className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Call Back</span>
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
