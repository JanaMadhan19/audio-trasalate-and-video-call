export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  role: 'user' | 'admin';
  twoFactorEnabled: boolean;
  preferredLanguage: string; // default 'te' (Telugu)
  status: 'active' | 'suspended';
  createdAt: string;
}

export interface EncryptedUserRecord {
  id: string;
  encryptedData: string; // AES-256-GCM encrypted payload
  iv: string;
  tag: string;
  maskedPhone: string;
  maskedEmail: string;
  name: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  createdAt: string;
}

export interface CallRecord {
  id: string;
  callerId: string;
  callerName: string;
  callerPhone: string;
  callerAvatar?: string;
  recipientId: string;
  recipientName: string;
  recipientPhone: string;
  recipientAvatar?: string;
  type: 'video' | 'audio';
  status: 'completed' | 'missed' | 'rejected' | 'busy';
  startedAt: string;
  endedAt?: string;
  durationSeconds: number;
  roomCode: string;
  isRead?: boolean;
}

export interface SpeechTranscriptItem {
  id: string;
  speakerId: string;
  speakerName: string;
  originalText: string;
  sourceLang: string;
  targetLang: string;
  translatedText: string;
  timestamp: string;
  isFinal: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
  encrypted: boolean;
  roomCode: string;
}

export interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
  speechCode: string; // For Web Speech API SpeechRecognition
  ttsCode: string;    // For SpeechSynthesis
}

export interface CollaborativeDocument {
  roomCode: string;
  title: string;
  content: string;
  lastUpdatedBy: string;
  updatedAt: string;
}

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalCalls: number;
  missedCalls: number;
  activeConnections: number;
  encryptionAlgorithm: string;
  uptimeSeconds: number;
}
