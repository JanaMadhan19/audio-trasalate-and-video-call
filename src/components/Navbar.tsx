import React from 'react';
import { Phone, Shield, Bell, Globe, LogOut, User as UserIcon, Lock, Sparkles, Radio } from 'lucide-react';
import { User } from '../types';
import { SUPPORTED_LANGUAGES } from '../services/languages';

interface NavbarProps {
  currentUser: User | null;
  onOpenAuth: () => void;
  onLogout: () => void;
  onOpenAdmin: () => void;
  onSelectLanguage: (lang: string) => void;
  unreadMissedCallsCount: number;
  onOpenCallHistory: () => void;
  isWsConnected: boolean;
  isInCall: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  onOpenAuth,
  onLogout,
  onOpenAdmin,
  onSelectLanguage,
  unreadMissedCallsCount,
  onOpenCallHistory,
  isWsConnected,
  isInCall,
}) => {
  const currentLang = SUPPORTED_LANGUAGES.find((l) => l.code === (currentUser?.preferredLanguage || 'te'));

  return (
    <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white font-bold">
            <Phone className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-indigo-200 bg-clip-text text-transparent">
                TelCall
              </span>
              <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                WebRTC & AI
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              1-to-1 Video • Live Telugu Voice Translation • E2EE
            </p>
          </div>
        </div>

        {/* Center / Status */}
        <div className="hidden md:flex items-center space-x-4">
          {/* WebSocket Status Indicator */}
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                isWsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
              }`}
            />
            <span className="text-slate-300">
              {isWsConnected ? 'Live Network' : 'Reconnecting...'}
            </span>
          </div>

          {/* Active Call Badge */}
          {isInCall && (
            <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-medium animate-pulse">
              <Radio className="w-3.5 h-3.5" />
              <span>Call in Progress</span>
            </div>
          )}
        </div>

        {/* Right Actions */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Preferred Language Selector */}
          <div className="relative group">
            <button className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-medium text-slate-200 transition">
              <Globe className="w-3.5 h-3.5 text-indigo-400" />
              <span>{currentLang?.nativeName || 'తెలుగు'}</span>
              <span className="text-[10px] text-slate-400">({currentLang?.code.toUpperCase()})</span>
            </button>
            <div className="absolute right-0 mt-2 w-48 py-1.5 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-events-none group-hover:pointer-events-auto transition duration-150 z-50">
              <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                Voice Translation Language
              </div>
              {SUPPORTED_LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => onSelectLanguage(lang.code)}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-indigo-600/20 transition ${
                    (currentUser?.preferredLanguage || 'te') === lang.code
                      ? 'text-indigo-400 font-semibold bg-indigo-500/10'
                      : 'text-slate-300'
                  }`}
                >
                  <span>{lang.nativeName} ({lang.name})</span>
                  {lang.code === 'te' && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                      Default
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Missed Call Alerts */}
          {currentUser && (
            <button
              onClick={onOpenCallHistory}
              title="Call History & Missed Calls"
              className="relative p-2 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 transition"
            >
              <Bell className="w-4 h-4" />
              {unreadMissedCallsCount > 0 && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white animate-bounce shadow">
                  {unreadMissedCallsCount}
                </span>
              )}
            </button>
          )}

          {/* Admin Dashboard Entry */}
          <button
            onClick={onOpenAdmin}
            title="Secure Admin Portal"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-medium text-slate-300 hover:text-white transition"
          >
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Admin</span>
          </button>

          {/* User Profile or Login */}
          {currentUser ? (
            <div className="flex items-center space-x-2 pl-2 border-l border-slate-800">
              <img
                src={currentUser.avatar}
                alt={currentUser.name}
                className="w-8 h-8 rounded-full border border-indigo-500/40 object-cover"
              />
              <div className="hidden lg:block text-left text-xs">
                <div className="font-semibold text-slate-100 flex items-center space-x-1">
                  <span>{currentUser.name}</span>
                  <Lock className="w-3 h-3 text-emerald-400" />
                </div>
                <div className="text-[11px] text-indigo-400 font-mono">
                  {currentUser.phone}
                </div>
              </div>
              <button
                onClick={onLogout}
                title="Log Out"
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 transition"
            >
              <UserIcon className="w-3.5 h-3.5" />
              <span>Sign In / Register</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
