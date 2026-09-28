import React, { useState, useEffect } from 'react';
import { Phone, Video, PhoneCall, Link2, AlertCircle, CheckCircle2, UserCheck, Shield, Sparkles, Delete, Copy, Check } from 'lucide-react';
import { User } from '../types';

interface DialerProps {
  currentUser: User | null;
  onInitiateCall: (targetUser: { id: string; name: string; phone: string; avatar?: string; preferredLanguage?: string }, isVideo: boolean) => void;
  onOpenMeetingShare: () => void;
  onPromptAuth: () => void;
  onUpdatePhone: (newPhone: string) => void;
}

export const Dialer: React.FC<DialerProps> = ({
  currentUser,
  onInitiateCall,
  onOpenMeetingShare,
  onPromptAuth,
  onUpdatePhone,
}) => {
  const [targetPhone, setTargetPhone] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [foundUser, setFoundUser] = useState<any | null>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [showPhoneUpdate, setShowPhoneUpdate] = useState(false);
  const [myPhoneInput, setMyPhoneInput] = useState(currentUser?.phone || '');

  // Load directory contacts
  useEffect(() => {
    fetch('/api/users/directory')
      .then((res) => res.json())
      .then((data) => {
        if (data.contacts) {
          // Filter out current user from directory list
          setContacts(data.contacts.filter((c: any) => c.id !== currentUser?.id));
        }
      })
      .catch((err) => console.warn('Directory load error:', err));
  }, [currentUser?.id]);

  const handleKeypadPress = (val: string) => {
    setErrorMessage(null);
    setFoundUser(null);
    setTargetPhone((prev) => prev + val);
  };

  const handleBackspace = () => {
    setErrorMessage(null);
    setFoundUser(null);
    setTargetPhone((prev) => prev.slice(0, -1));
  };

  const handleDial = async (isVideo: boolean = true) => {
    if (!currentUser) {
      onPromptAuth();
      return;
    }

    if (!targetPhone.trim()) {
      setErrorMessage('Please enter a phone number to call.');
      return;
    }

    setIsValidating(true);
    setErrorMessage(null);
    setFoundUser(null);

    try {
      const res = await fetch(`/api/users/lookup?phone=${encodeURIComponent(targetPhone.trim())}`);
      const data = await res.json();

      if (!res.ok || !data.exists) {
        // User requested: "if that number have dont account it will give that number have no account or please give me valid user"
        setErrorMessage(
          data.error || 'That number has no account. Please give a valid user phone number or share a meeting link.'
        );
        setIsValidating(false);
        return;
      }

      // Check if trying to call self
      if (data.user.id === currentUser.id) {
        setErrorMessage('You cannot place a video call to your own phone number.');
        setIsValidating(false);
        return;
      }

      setFoundUser(data.user);
      onInitiateCall(data.user, isVideo);
    } catch (err: any) {
      setErrorMessage('Network error validating user phone number. Please try again.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleQuickCallContact = (contact: any) => {
    setTargetPhone(contact.phone);
    if (!currentUser) {
      onPromptAuth();
      return;
    }
    onInitiateCall(contact, true);
  };

  const handleSaveMyPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !myPhoneInput.trim()) return;

    try {
      const res = await fetch('/api/user/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          phone: myPhoneInput.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onUpdatePhone(myPhoneInput.trim());
        setShowPhoneUpdate(false);
      } else {
        setErrorMessage(data.error || 'Failed to update phone number');
      }
    } catch (e) {
      setErrorMessage('Error updating phone number');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left/Main Column: Phone Dialer */}
      <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        {/* Decorative background glow */}
        <div className="absolute -top-24 -left-24 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Current User Status Banner */}
        <div className="mb-6 p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <img
                src={
                  currentUser?.avatar ||
                  'https://api.dicebear.com/7.x/avataaars/svg?seed=guest'
                }
                alt="My Avatar"
                className="w-11 h-11 rounded-full border-2 border-indigo-500/40 object-cover"
              />
              <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-slate-900" />
            </div>
            <div>
              <div className="text-xs text-slate-400">Your Calling Number</div>
              <div className="text-sm font-bold text-white font-mono flex items-center space-x-2">
                <span>{currentUser ? currentUser.phone : 'Not logged in'}</span>
                {currentUser && (
                  <button
                    onClick={() => {
                      setMyPhoneInput(currentUser.phone);
                      setShowPhoneUpdate(!showPhoneUpdate);
                    }}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 underline font-sans"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="text-right">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <Shield className="w-2.5 h-2.5 mr-1" />
              E2EE Ready
            </span>
          </div>
        </div>

        {/* Phone Update Form (if toggled) */}
        {showPhoneUpdate && (
          <form onSubmit={handleSaveMyPhone} className="mb-5 p-3 rounded-xl bg-slate-800 border border-indigo-500/40 space-y-2">
            <label className="block text-xs font-semibold text-slate-200">
              Update Registered Phone Number:
            </label>
            <div className="flex space-x-2">
              <input
                type="tel"
                value={myPhoneInput}
                onChange={(e) => setMyPhoneInput(e.target.value)}
                placeholder="+1-234-567-8900"
                className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                required
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-semibold text-white transition"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setShowPhoneUpdate(false)}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs text-slate-300"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Dial Display */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5 px-1">
            <span>Enter Recipient Phone Number</span>
            <span className="text-[11px] text-indigo-400">Account verification on dial</span>
          </div>

          <div className="relative">
            <input
              type="text"
              value={targetPhone}
              onChange={(e) => {
                setErrorMessage(null);
                setFoundUser(null);
                setTargetPhone(e.target.value);
              }}
              placeholder="e.g. +1-987-654-3210"
              className="w-full text-center text-xl sm:text-2xl font-mono tracking-wider py-4 px-12 rounded-2xl bg-slate-950/70 border-2 border-slate-700/80 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition shadow-inner"
            />
            {targetPhone && (
              <button
                onClick={handleBackspace}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-rose-400 rounded-lg transition"
                title="Backspace"
              >
                <Delete className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Error / Account Verification Alert */}
        {errorMessage && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs sm:text-sm flex items-start space-x-3 animate-in shake duration-200">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-rose-300">Account Validation Failed</div>
              <p className="mt-0.5 leading-relaxed">{errorMessage}</p>
              <div className="mt-2 text-[11px] text-slate-300 flex items-center space-x-2">
                <span>Want to connect anyway?</span>
                <button
                  onClick={onOpenMeetingShare}
                  className="text-indigo-300 underline font-semibold hover:text-white"
                >
                  Share an Instant Meeting Link
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Found User Preview */}
        {foundUser && (
          <div className="mb-6 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <span>
                Verified Account: <strong>{foundUser.name}</strong> ({foundUser.phone})
              </span>
            </div>
            <span className="text-[10px] bg-emerald-500/20 px-2 py-0.5 rounded text-emerald-300">
              Ready to Call
            </span>
          </div>
        )}

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-2.5 max-w-sm mx-auto mb-6">
          {[
            { num: '1', sub: '' },
            { num: '2', sub: 'ABC' },
            { num: '3', sub: 'DEF' },
            { num: '4', sub: 'GHI' },
            { num: '5', sub: 'JKL' },
            { num: '6', sub: 'MNO' },
            { num: '7', sub: 'PQRS' },
            { num: '8', sub: 'TUV' },
            { num: '9', sub: 'WXYZ' },
            { num: '*', sub: '' },
            { num: '0', sub: '+' },
            { num: '#', sub: '' },
          ].map((key) => (
            <button
              key={key.num}
              onClick={() => handleKeypadPress(key.num === '0' && key.sub === '+' && targetPhone === '' ? '+' : key.num)}
              className="py-3.5 rounded-2xl bg-slate-800/80 hover:bg-slate-750 active:bg-indigo-600 active:scale-95 border border-slate-700/60 text-white font-semibold transition flex flex-col items-center justify-center shadow-sm"
            >
              <span className="text-xl font-mono leading-none">{key.num}</span>
              {key.sub && (
                <span className="text-[9px] text-slate-400 font-medium tracking-widest mt-0.5">
                  {key.sub}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Action Call Buttons */}
        <div className="flex space-x-3 max-w-sm mx-auto">
          <button
            onClick={() => handleDial(true)}
            disabled={isValidating}
            className="flex-1 py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 active:scale-95 text-white font-bold text-sm shadow-lg shadow-emerald-500/25 flex items-center justify-center space-x-2 transition disabled:opacity-50"
          >
            <Video className="w-4 h-4" />
            <span>{isValidating ? 'Validating...' : 'Video Call'}</span>
          </button>

          <button
            onClick={() => handleDial(false)}
            disabled={isValidating}
            className="py-3.5 px-5 rounded-2xl bg-slate-800 hover:bg-slate-750 active:scale-95 border border-slate-700 text-slate-200 font-semibold text-sm shadow flex items-center justify-center space-x-1.5 transition disabled:opacity-50"
            title="Audio-Only Call"
          >
            <PhoneCall className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">Audio</span>
          </button>
        </div>
      </div>

      {/* Right Column: Registered Contacts & Meeting Link Sharing */}
      <div className="lg:col-span-5 space-y-6">
        {/* Instant Meeting Link Generator */}
        <div className="bg-gradient-to-br from-indigo-950/60 via-slate-900 to-slate-900 border border-indigo-800/40 rounded-3xl p-6 shadow-xl relative">
          <div className="flex items-center space-x-2.5 mb-2">
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Instant Meeting Link</h3>
              <p className="text-xs text-slate-400">No phone number required</p>
            </div>
          </div>
          <p className="text-xs text-slate-300 mt-2 leading-relaxed">
            Create an instant meeting room and share the link with any colleague or friend. Includes real-time document editing and screen sharing.
          </p>

          <button
            onClick={onOpenMeetingShare}
            className="w-full mt-4 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 flex items-center justify-center space-x-2 transition"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>Generate & Share Meeting Link</span>
          </button>
        </div>

        {/* Verified User Directory (Quick Dial) */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <span>Registered Accounts Directory</span>
            </h3>
            <span className="text-[11px] text-slate-400 font-mono">
              {contacts.length} Available
            </span>
          </div>

          <p className="text-xs text-slate-400 mb-3">
            Click any registered contact below to dial immediately:
          </p>

          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {contacts.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500">
                Loading verified accounts...
              </div>
            ) : (
              contacts.map((contact) => (
                <div
                  key={contact.id}
                  className="p-3 rounded-2xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 flex items-center justify-between transition group"
                >
                  <div className="flex items-center space-x-3">
                    <img
                      src={contact.avatar}
                      alt={contact.name}
                      className="w-9 h-9 rounded-full object-cover border border-slate-700"
                    />
                    <div>
                      <div className="text-xs font-semibold text-white flex items-center space-x-1.5">
                        <span>{contact.name}</span>
                        {contact.preferredLanguage === 'te' && (
                          <span className="text-[9px] px-1 rounded bg-indigo-500/20 text-indigo-300">
                            తెలుగు
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400">
                        {contact.phone}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleQuickCallContact(contact)}
                    className="p-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-white transition"
                    title={`Call ${contact.name}`}
                  >
                    <Video className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
