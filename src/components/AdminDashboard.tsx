import React, { useState, useEffect } from 'react';
import {
  Shield,
  ShieldAlert,
  Lock,
  Key,
  Users,
  PhoneCall,
  Activity,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  RefreshCw,
  LogOut,
  Play,
  Terminal,
  Database,
  ArrowRight,
  FileCheck,
} from 'lucide-react';
import { runAutomatedSpeechUnitTests, UnitTestResult } from '../services/speech';

interface AdminDashboardProps {
  onClose: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onClose }) => {
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [isDefaultPassword, setIsDefaultPassword] = useState(false);

  // Admin login credentials
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('admin');
  const [loginError, setLoginError] = useState<string | null>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState<string | null>(null);
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);

  // Dashboard Data
  const [dashboardData, setDashboardData] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showDecryptedPlaintext, setShowDecryptedPlaintext] = useState(false);

  // Automated Unit Tests State
  const [testResults, setTestResults] = useState<{
    total: number;
    passed: number;
    failed: number;
    results: UnitTestResult[];
  } | null>(null);
  const [isRunningTests, setIsRunningTests] = useState(false);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/dashboard');
      const data = await res.json();
      setDashboardData(data);
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: adminUsername, password: adminPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      setIsAdminLoggedIn(true);
      setIsDefaultPassword(data.isDefaultPassword);
      if (data.isDefaultPassword) {
        setCurrentPassword(adminPassword);
      }
      fetchDashboardData();
    } catch (err: any) {
      setLoginError(err.message);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordChangeSuccess(null);
    setPasswordChangeError(null);

    if (newPassword !== confirmPassword) {
      setPasswordChangeError('New passwords do not match.');
      return;
    }

    try {
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update admin password');
      }

      setPasswordChangeSuccess(data.message);
      setIsDefaultPassword(false);
      setAdminPassword(newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      fetchDashboardData();
    } catch (err: any) {
      setPasswordChangeError(err.message);
    }
  };

  const handleToggleUserStatus = async (userId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      await fetch(`/api/admin/user/${userId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      fetchDashboardData();
    } catch (e) {
      console.warn('Error toggling status:', e);
    }
  };

  const handleRunTests = async () => {
    setIsRunningTests(true);
    try {
      const results = await runAutomatedSpeechUnitTests();
      setTestResults(results);
    } catch (err) {
      console.error('Test execution failed:', err);
    } finally {
      setIsRunningTests(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 sm:p-6 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-6xl rounded-3xl shadow-2xl overflow-hidden text-slate-100 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white">Administrator Secure Dashboard</h2>
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">
                  AES-256 Encrypted Store
                </span>
              </div>
              <p className="text-xs text-slate-400">
                User Records Management • AES-GCM Cipher Audit • Speech Testing Engine
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {isAdminLoggedIn && (
              <button
                onClick={() => setIsAdminLoggedIn(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-xs text-slate-300 flex items-center space-x-1.5 transition"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log Out</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {!isAdminLoggedIn ? (
            /* Admin Login Gate */
            <div className="max-w-md mx-auto py-8">
              <div className="text-center mb-6">
                <Lock className="w-12 h-12 text-amber-400 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-white">Admin Authentication Required</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Access restricted to system administrators. Default initial credentials:
                  <br />
                  <code className="text-amber-300 font-bold bg-amber-950/40 px-2 py-0.5 rounded mt-1 inline-block">
                    username: admin | password: admin
                  </code>
                </p>
              </div>

              {loginError && (
                <div className="mb-4 p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs">
                  {loginError}
                </div>
              )}

              <form onSubmit={handleAdminLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Admin Username
                  </label>
                  <input
                    type="text"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Admin Password
                  </label>
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-lg shadow-amber-600/30 transition"
                >
                  Authenticate Admin
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Mandatory / Recommended Password Change Banner */}
              {isDefaultPassword && (
                <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-start space-x-3">
                  <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-bold text-amber-300">
                      Security Alert: Default Initial Password Detected
                    </div>
                    <p className="text-xs text-amber-200/80 mt-0.5">
                      You are logged in with the initial default password ("admin"). Please set a strong, custom password below to secure administrator controls.
                    </p>
                  </div>
                </div>
              )}

              {/* Stats Overview */}
              {dashboardData?.stats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60">
                    <div className="text-xs text-slate-400 flex items-center space-x-1.5">
                      <Users className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Total Users</span>
                    </div>
                    <div className="text-2xl font-bold text-white mt-1">
                      {dashboardData.stats.totalUsers}
                    </div>
                    <div className="text-[10px] text-emerald-400 mt-0.5">
                      {dashboardData.stats.activeUsers} active
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60">
                    <div className="text-xs text-slate-400 flex items-center space-x-1.5">
                      <PhoneCall className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Total Sessions</span>
                    </div>
                    <div className="text-2xl font-bold text-white mt-1">
                      {dashboardData.stats.totalCalls}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {dashboardData.stats.missedCalls} missed
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60">
                    <div className="text-xs text-slate-400 flex items-center space-x-1.5">
                      <Activity className="w-3.5 h-3.5 text-teal-400" />
                      <span>Live WebSocket Clients</span>
                    </div>
                    <div className="text-2xl font-bold text-teal-300 mt-1">
                      {dashboardData.stats.activeConnections}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Real-time signaling</div>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60">
                    <div className="text-xs text-slate-400 flex items-center space-x-1.5">
                      <Database className="w-3.5 h-3.5 text-amber-400" />
                      <span>Data Protection</span>
                    </div>
                    <div className="text-xs font-mono font-bold text-amber-300 mt-2 truncate">
                      {dashboardData.stats.encryptionAlgorithm}
                    </div>
                    <div className="text-[10px] text-emerald-400 mt-0.5">Zero Plaintext Storage</div>
                  </div>
                </div>
              )}

              {/* Password Change Form */}
              <div className="p-5 rounded-2xl bg-slate-800/40 border border-slate-700/60">
                <h3 className="text-sm font-bold text-white flex items-center space-x-2 mb-3">
                  <Key className="w-4 h-4 text-amber-400" />
                  <span>Update Admin Password</span>
                </h3>

                {passwordChangeSuccess && (
                  <div className="mb-3 p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs">
                    {passwordChangeSuccess}
                  </div>
                )}
                {passwordChangeError && (
                  <div className="mb-3 p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs">
                    {passwordChangeError}
                  </div>
                )}

                <form onSubmit={handleChangePassword} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-300 mb-1">
                      Current Password
                    </label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Current password"
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-300 mb-1">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New password (min 5 chars)"
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-300 mb-1">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                      required
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="w-full py-2 px-4 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition"
                    >
                      Update Password
                    </button>
                  </div>
                </form>
              </div>

              {/* AUTOMATED UNIT TESTS FOR SPEECH PROCESSING COMPONENTS */}
              <div className="p-5 rounded-2xl bg-indigo-950/30 border border-indigo-800/40">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-indigo-900/60 gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                      <Terminal className="w-4 h-4 text-indigo-400" />
                      <span>Automated Speech Processing Unit Tests</span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Validates speech text normalization, Telugu translation dictionary, latency, and language switching
                    </p>
                  </div>

                  <button
                    onClick={handleRunTests}
                    disabled={isRunningTests}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1.5 transition disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{isRunningTests ? 'Running Suite...' : 'Run Automated Tests'}</span>
                  </button>
                </div>

                {testResults && (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center space-x-3 text-xs mb-3">
                      <span className="text-emerald-400 font-bold">
                        {testResults.passed} / {testResults.total} Tests Passed
                      </span>
                      {testResults.failed > 0 && (
                        <span className="text-rose-400 font-bold">
                          {testResults.failed} Failed
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5 font-mono text-xs">
                      {testResults.results.map((res, idx) => (
                        <div
                          key={idx}
                          className={`p-2 rounded-lg flex items-center justify-between ${
                            res.passed
                              ? 'bg-emerald-950/40 border border-emerald-800/30 text-emerald-200'
                              : 'bg-rose-950/40 border border-rose-800/30 text-rose-200'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            {res.passed ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            ) : (
                              <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                            )}
                            <span className="font-semibold">{res.name}</span>
                            <span className="text-slate-400 text-[11px]">({res.message})</span>
                          </div>
                          <span className="text-[10px] text-slate-500">{res.durationMs}ms</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ENCRYPTED USER RECORDS TABLE */}
              <div className="p-5 rounded-2xl bg-slate-800/40 border border-slate-700/60">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-700 gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                      <Users className="w-4 h-4 text-emerald-400" />
                      <span>User Records & Encryption Proof</span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Sensitive phone numbers and emails stored on disk encrypted via AES-256-GCM
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setShowDecryptedPlaintext(!showDecryptedPlaintext)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 flex items-center space-x-1.5 border border-slate-700 transition"
                    >
                      {showDecryptedPlaintext ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5" />
                          <span>Show Encrypted Ciphertext</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5 text-amber-400" />
                          <span>Authorized Decrypt View</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={fetchDashboardData}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                        <th className="py-2 px-3">User</th>
                        <th className="py-2 px-3">
                          {showDecryptedPlaintext ? 'Decrypted Phone' : 'AES-GCM Ciphertext (Disk)'}
                        </th>
                        <th className="py-2 px-3">Auth / 2FA</th>
                        <th className="py-2 px-3">Language</th>
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {dashboardData?.users?.map((u: any) => (
                        <tr key={u.id} className="hover:bg-slate-800/30 transition">
                          <td className="py-3 px-3">
                            <div className="flex items-center space-x-2">
                              <img
                                src={u.avatar}
                                alt={u.name}
                                className="w-7 h-7 rounded-full object-cover"
                              />
                              <div>
                                <div className="font-semibold text-white">{u.name}</div>
                                <div className="text-[10px] text-slate-500 font-mono">{u.id}</div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-3 font-mono">
                            {showDecryptedPlaintext ? (
                              <span className="text-emerald-400 font-bold">{u.decryptedPhone}</span>
                            ) : (
                              <div className="max-w-xs truncate text-[11px] text-amber-300/80 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                                {u.encryptedPhoneCipher.slice(0, 24)}... (IV: {u.phoneIv})
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                                u.twoFactorEnabled
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-slate-700 text-slate-400'
                              }`}
                            >
                              {u.twoFactorEnabled ? '2FA Active' : 'Standard'}
                            </span>
                          </td>

                          <td className="py-3 px-3">
                            <span className="font-semibold text-indigo-300 uppercase text-[10px]">
                              {u.preferredLanguage || 'te'}
                            </span>
                          </td>

                          <td className="py-3 px-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                                u.status === 'active'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-rose-500/20 text-rose-300'
                              }`}
                            >
                              {u.status}
                            </span>
                          </td>

                          <td className="py-3 px-3 text-right">
                            <button
                              onClick={() => handleToggleUserStatus(u.id, u.status)}
                              className={`px-2.5 py-1 rounded text-[10px] font-semibold transition ${
                                u.status === 'active'
                                  ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                                  : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                              }`}
                            >
                              {u.status === 'active' ? 'Suspend' : 'Activate'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
