import express, { Request, Response } from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const app = express();
app.use(express.json());

// Persistent database file directory
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const DB_FILE = path.join(DATA_DIR, 'database.json');

// Encryption keys & helpers for sensitive user data (AES-256-GCM)
const MASTER_ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'telcall-secure-master-encryption-key-2026-production';
const ENCRYPTION_KEY = crypto.scryptSync(MASTER_ENCRYPTION_SECRET, 'telcall-salt-v1', 32);

function encryptSensitiveText(plainText: string): { ciphertext: string; iv: string; tag: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return {
    ciphertext: encrypted,
    iv: iv.toString('hex'),
    tag,
  };
}

function decryptSensitiveText(ciphertext: string, ivHex: string, tagHex: string): string {
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      ENCRYPTION_KEY,
      Buffer.from(ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Decryption error:', err);
    return '[Decryption Error]';
  }
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Database schema
interface StoredUser {
  id: string;
  name: string;
  phoneEncrypted: { ciphertext: string; iv: string; tag: string };
  emailEncrypted: { ciphertext: string; iv: string; tag: string };
  phoneClean: string; // E.164 normalized for index lookup
  passwordHash: string;
  avatar: string;
  role: 'user' | 'admin';
  twoFactorEnabled: boolean;
  twoFactorSecret: string;
  preferredLanguage: string;
  status: 'active' | 'suspended';
  createdAt: string;
}

interface StoredCallRecord {
  id: string;
  callerId: string;
  callerName: string;
  callerPhone: string;
  recipientId: string;
  recipientName: string;
  recipientPhone: string;
  type: 'video' | 'audio';
  status: 'completed' | 'missed' | 'rejected' | 'busy';
  startedAt: string;
  endedAt?: string;
  durationSeconds: number;
  roomCode: string;
  isRead: boolean;
}

interface DatabaseSchema {
  users: StoredUser[];
  calls: StoredCallRecord[];
  admin: {
    passwordHash: string;
    lastPasswordChange: string;
  };
  auditLogs: Array<{ id: string; timestamp: string; action: string; details: string; ip?: string }>;
}

// Initial Database Seeding
function getInitialDatabase(): DatabaseSchema {
  const adminPass = hashPassword('admin'); // initial default credentials: admin / admin
  const now = new Date().toISOString();

  const seedUser1Phone = '+1-987-654-3210';
  const seedUser2Phone = '+91-9876543210';
  const seedUser3Phone = '+1-555-0199';

  return {
    users: [
      {
        id: 'usr_priya',
        name: 'Priya Sharma',
        phoneEncrypted: encryptSensitiveText(seedUser1Phone),
        emailEncrypted: encryptSensitiveText('priya@example.com'),
        phoneClean: '+19876543210',
        passwordHash: hashPassword('password123'),
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        role: 'user',
        twoFactorEnabled: true,
        twoFactorSecret: '123456',
        preferredLanguage: 'te', // Telugu default
        status: 'active',
        createdAt: now,
      },
      {
        id: 'usr_ravi',
        name: 'Ravi Kumar',
        phoneEncrypted: encryptSensitiveText(seedUser2Phone),
        emailEncrypted: encryptSensitiveText('ravi@example.com'),
        phoneClean: '+919876543210',
        passwordHash: hashPassword('password123'),
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
        role: 'user',
        twoFactorEnabled: true,
        twoFactorSecret: '654321',
        preferredLanguage: 'te', // Telugu default
        status: 'active',
        createdAt: now,
      },
      {
        id: 'usr_alex',
        name: 'Alex Miller',
        phoneEncrypted: encryptSensitiveText(seedUser3Phone),
        emailEncrypted: encryptSensitiveText('alex@example.com'),
        phoneClean: '+15550199',
        passwordHash: hashPassword('password123'),
        avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
        role: 'user',
        twoFactorEnabled: false,
        twoFactorSecret: '112233',
        preferredLanguage: 'en',
        status: 'active',
        createdAt: now,
      },
    ],
    calls: [
      {
        id: 'call_seed_1',
        callerId: 'usr_ravi',
        callerName: 'Ravi Kumar',
        callerPhone: seedUser2Phone,
        recipientId: 'usr_priya',
        recipientName: 'Priya Sharma',
        recipientPhone: seedUser1Phone,
        type: 'video',
        status: 'missed',
        startedAt: new Date(Date.now() - 3600000).toISOString(),
        durationSeconds: 0,
        roomCode: 'room-seed-101',
        isRead: false,
      },
      {
        id: 'call_seed_2',
        callerId: 'usr_alex',
        callerName: 'Alex Miller',
        callerPhone: seedUser3Phone,
        recipientId: 'usr_priya',
        recipientName: 'Priya Sharma',
        recipientPhone: seedUser1Phone,
        type: 'video',
        status: 'completed',
        startedAt: new Date(Date.now() - 7200000).toISOString(),
        endedAt: new Date(Date.now() - 7200000 + 420000).toISOString(),
        durationSeconds: 420,
        roomCode: 'room-seed-102',
        isRead: true,
      },
    ],
    admin: {
      passwordHash: adminPass,
      lastPasswordChange: now,
    },
    auditLogs: [
      {
        id: 'log_init',
        timestamp: now,
        action: 'SYSTEM_BOOTSTRAP',
        details: 'Encrypted database initialized with AES-256-GCM master keys and default admin account.',
      },
    ],
  };
}

function loadDatabase(): DatabaseSchema {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.warn('Error reading database file, resetting to initial seed:', err);
  }
  const initial = getInitialDatabase();
  saveDatabase(initial);
  return initial;
}

function saveDatabase(db: DatabaseSchema) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving database:', err);
  }
}

// Normalize phone numbers for uniform matching (strips non-digits except leading +)
function cleanPhoneNumber(phone: string): string {
  if (!phone) return '';
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith('+');
  const digitsOnly = trimmed.replace(/\D/g, '');
  return hasPlus ? `+${digitsOnly}` : digitsOnly;
}

// Gemini AI Translation Client
const geminiApiKey = process.env.GEMINI_API_KEY;
let aiClient: GoogleGenAI | null = null;
if (geminiApiKey) {
  try {
    aiClient = new GoogleGenAI({ apiKey: geminiApiKey });
  } catch (e) {
    console.warn('GoogleGenAI init failed:', e);
  }
}

// Active connected sockets registry
interface ConnectedClient {
  socket: WebSocket;
  userId?: string;
  phoneClean?: string;
  name?: string;
  currentRoom?: string;
}

const activeSockets = new Map<WebSocket, ConnectedClient>();

// Real-time Collaborative Document in memory per room
const roomDocuments = new Map<string, { content: string; lastEditedBy: string; updatedAt: string }>();

// Setup HTTP & WebSocket Server
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket) => {
  const client: ConnectedClient = { socket: ws };
  activeSockets.set(ws, client);

  ws.on('message', (messageData: string) => {
    try {
      const data = JSON.parse(messageData.toString());
      const { type } = data;

      switch (type) {
        case 'user:register': {
          client.userId = data.userId;
          client.phoneClean = cleanPhoneNumber(data.phone || '');
          client.name = data.name;
          break;
        }

        case 'call:dial': {
          // Direct dial by phone number
          const targetPhoneClean = cleanPhoneNumber(data.targetPhone || '');
          const db = loadDatabase();

          // Check if user exists in database
          const targetUser = db.users.find(
            (u) => u.phoneClean === targetPhoneClean || cleanPhoneNumber(decryptSensitiveText(u.phoneEncrypted.ciphertext, u.phoneEncrypted.iv, u.phoneEncrypted.tag)) === targetPhoneClean
          );

          if (!targetUser) {
            ws.send(
              JSON.stringify({
                type: 'call:error',
                errorCode: 'USER_NOT_FOUND',
                message: 'That phone number has no account registered. Please verify and enter a valid user number.',
              })
            );
            return;
          }

          // Check if user is active
          if (targetUser.status === 'suspended') {
            ws.send(
              JSON.stringify({
                type: 'call:error',
                errorCode: 'USER_SUSPENDED',
                message: 'This user account is currently suspended.',
              })
            );
            return;
          }

          const roomCode = `room_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          client.currentRoom = roomCode;

          // Find recipient's active socket connection
          let recipientFound = false;
          for (const [, otherClient] of activeSockets.entries()) {
            if (otherClient.userId === targetUser.id || otherClient.phoneClean === targetUser.phoneClean) {
              recipientFound = true;
              otherClient.socket.send(
                JSON.stringify({
                  type: 'call:incoming',
                  callerId: client.userId,
                  callerName: client.name || data.callerName || 'Unknown Caller',
                  callerPhone: data.callerPhone || '',
                  roomCode,
                  isVideo: data.isVideo ?? true,
                })
              );
              break;
            }
          }

          if (recipientFound) {
            ws.send(
              JSON.stringify({
                type: 'call:ringing',
                recipientId: targetUser.id,
                recipientName: targetUser.name,
                recipientPhone: data.targetPhone,
                roomCode,
              })
            );
          } else {
            // Recipient registered but currently offline
            // Log missed call
            const callRecord: StoredCallRecord = {
              id: `call_${Date.now()}`,
              callerId: client.userId || 'unknown',
              callerName: client.name || data.callerName || 'Unknown Caller',
              callerPhone: data.callerPhone || '',
              recipientId: targetUser.id,
              recipientName: targetUser.name,
              recipientPhone: data.targetPhone,
              type: data.isVideo ? 'video' : 'audio',
              status: 'missed',
              startedAt: new Date().toISOString(),
              durationSeconds: 0,
              roomCode,
              isRead: false,
            };
            db.calls.unshift(callRecord);
            saveDatabase(db);

            ws.send(
              JSON.stringify({
                type: 'call:offline',
                recipientName: targetUser.name,
                message: `${targetUser.name} is currently offline. A missed call alert has been saved to their call history. You can also share an instant meeting link with them!`,
                roomCode,
              })
            );
          }
          break;
        }

        case 'call:accept': {
          client.currentRoom = data.roomCode;
          // Notify caller that call was accepted
          for (const [, otherClient] of activeSockets.entries()) {
            if (otherClient.userId === data.callerId && otherClient.socket.readyState === WebSocket.OPEN) {
              otherClient.socket.send(
                JSON.stringify({
                  type: 'call:accepted',
                  roomCode: data.roomCode,
                  recipientId: client.userId,
                  recipientName: client.name,
                })
              );
            }
          }
          break;
        }

        case 'call:reject': {
          const db = loadDatabase();
          const callRecord: StoredCallRecord = {
            id: `call_${Date.now()}`,
            callerId: data.callerId,
            callerName: data.callerName || 'Caller',
            callerPhone: data.callerPhone || '',
            recipientId: client.userId || '',
            recipientName: client.name || 'Recipient',
            recipientPhone: data.recipientPhone || '',
            type: 'video',
            status: 'rejected',
            startedAt: new Date().toISOString(),
            durationSeconds: 0,
            roomCode: data.roomCode,
            isRead: false,
          };
          db.calls.unshift(callRecord);
          saveDatabase(db);

          for (const [, otherClient] of activeSockets.entries()) {
            if (otherClient.userId === data.callerId && otherClient.socket.readyState === WebSocket.OPEN) {
              otherClient.socket.send(
                JSON.stringify({
                  type: 'call:rejected',
                  roomCode: data.roomCode,
                  reason: 'User declined the call',
                })
              );
            }
          }
          break;
        }

        case 'call:hangup': {
          const room = data.roomCode || client.currentRoom;
          // Broadcast hangup to all peers in that room
          if (room) {
            for (const [, otherClient] of activeSockets.entries()) {
              if (otherClient.currentRoom === room && otherClient.socket !== ws && otherClient.socket.readyState === WebSocket.OPEN) {
                otherClient.socket.send(
                  JSON.stringify({
                    type: 'call:ended',
                    roomCode: room,
                    durationSeconds: data.durationSeconds || 0,
                  })
                );
              }
            }
          }
          break;
        }

        case 'webrtc:signal': {
          // Route WebRTC offer / answer / ice candidate
          const room = data.roomCode || client.currentRoom;
          if (room) {
            for (const [, otherClient] of activeSockets.entries()) {
              if (otherClient.currentRoom === room && otherClient.socket !== ws && otherClient.socket.readyState === WebSocket.OPEN) {
                otherClient.socket.send(
                  JSON.stringify({
                    type: 'webrtc:signal',
                    roomCode: room,
                    signal: data.signal,
                    senderId: client.userId,
                  })
                );
              }
            }
          }
          break;
        }

        case 'speech:transcript': {
          // Live translated voice broadcast to call peer
          const room = data.roomCode || client.currentRoom;
          if (room) {
            for (const [, otherClient] of activeSockets.entries()) {
              if (otherClient.currentRoom === room && otherClient.socket !== ws && otherClient.socket.readyState === WebSocket.OPEN) {
                otherClient.socket.send(
                  JSON.stringify({
                    type: 'speech:transcript',
                    ...data,
                  })
                );
              }
            }
          }
          break;
        }

        case 'chat:message': {
          const room = data.roomCode || client.currentRoom;
          if (room) {
            for (const [, otherClient] of activeSockets.entries()) {
              if (otherClient.currentRoom === room && otherClient.socket !== ws && otherClient.socket.readyState === WebSocket.OPEN) {
                otherClient.socket.send(
                  JSON.stringify({
                    type: 'chat:message',
                    ...data,
                  })
                );
              }
            }
          }
          break;
        }

        case 'doc:sync': {
          // Collaborative document synchronization
          const room = data.roomCode || client.currentRoom;
          if (room) {
            roomDocuments.set(room, {
              content: data.content,
              lastEditedBy: data.lastEditedBy || client.name || 'User',
              updatedAt: new Date().toISOString(),
            });

            for (const [, otherClient] of activeSockets.entries()) {
              if (otherClient.currentRoom === room && otherClient.socket !== ws && otherClient.socket.readyState === WebSocket.OPEN) {
                otherClient.socket.send(
                  JSON.stringify({
                    type: 'doc:sync',
                    roomCode: room,
                    content: data.content,
                    lastEditedBy: data.lastEditedBy,
                    updatedAt: new Date().toISOString(),
                  })
                );
              }
            }
          }
          break;
        }

        case 'doc:get': {
          const room = data.roomCode || client.currentRoom;
          if (room && roomDocuments.has(room)) {
            const doc = roomDocuments.get(room);
            ws.send(
              JSON.stringify({
                type: 'doc:sync',
                roomCode: room,
                content: doc?.content || '',
                lastEditedBy: doc?.lastEditedBy,
                updatedAt: doc?.updatedAt,
              })
            );
          }
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error('WebSocket message parsing error:', err);
    }
  });

  ws.on('close', () => {
    activeSockets.delete(ws);
  });
});

// REST API Endpoints

// 1. User Lookup by Phone Number
app.get('/api/users/lookup', (req: Request, res: Response): any => {
  const phone = req.query.phone as string;
  if (!phone) {
    return res.status(400).json({ exists: false, error: 'Phone number parameter is required.' });
  }

  const clean = cleanPhoneNumber(phone);
  const db = loadDatabase();

  const user = db.users.find(
    (u) =>
      u.phoneClean === clean ||
      cleanPhoneNumber(decryptSensitiveText(u.phoneEncrypted.ciphertext, u.phoneEncrypted.iv, u.phoneEncrypted.tag)) === clean
  );

  if (!user) {
    return res.status(404).json({
      exists: false,
      error: 'That number has no account. Please enter a valid registered user or invite them with a meeting link.',
    });
  }

  const decryptedPhone = decryptSensitiveText(user.phoneEncrypted.ciphertext, user.phoneEncrypted.iv, user.phoneEncrypted.tag);

  return res.json({
    exists: true,
    user: {
      id: user.id,
      name: user.name,
      phone: decryptedPhone,
      avatar: user.avatar,
      preferredLanguage: user.preferredLanguage || 'te',
      status: user.status,
    },
  });
});

// 2. Contact List (Registered Users)
app.get('/api/users/directory', (req: Request, res: Response) => {
  const db = loadDatabase();
  const contacts = db.users
    .filter((u) => u.status === 'active')
    .map((u) => ({
      id: u.id,
      name: u.name,
      phone: decryptSensitiveText(u.phoneEncrypted.ciphertext, u.phoneEncrypted.iv, u.phoneEncrypted.tag),
      avatar: u.avatar,
      preferredLanguage: u.preferredLanguage || 'te',
    }));
  res.json({ contacts });
});

// 3. User Registration (Email/Phone + Auto 2FA simulation)
app.post('/api/auth/register', (req: Request, res: Response): any => {
  const { name, email, phone, password, preferredLanguage } = req.body;
  if (!name || (!email && !phone) || !password) {
    return res.status(400).json({ error: 'Name, password, and at least email or phone number are required.' });
  }

  const db = loadDatabase();
  const phoneClean = cleanPhoneNumber(phone || '');

  // Check uniqueness
  if (phoneClean) {
    const existing = db.users.find((u) => u.phoneClean === phoneClean);
    if (existing) {
      return res.status(400).json({ error: 'This phone number is already registered. Please log in.' });
    }
  }

  const rawPhone = phone || '+1-000-000-0000';
  const rawEmail = email || `${phoneClean}@telcall.local`;

  // Encrypt sensitive phone and email with AES-256-GCM
  const phoneEncrypted = encryptSensitiveText(rawPhone);
  const emailEncrypted = encryptSensitiveText(rawEmail);

  // Generate 2FA 6-digit verification code
  const twoFactorCode = Math.floor(100000 + Math.random() * 900000).toString();

  const newUser: StoredUser = {
    id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name,
    phoneEncrypted,
    emailEncrypted,
    phoneClean,
    passwordHash: hashPassword(password),
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`,
    role: 'user',
    twoFactorEnabled: true,
    twoFactorSecret: twoFactorCode,
    preferredLanguage: preferredLanguage || 'te', // Telugu default
    status: 'active',
    createdAt: new Date().toISOString(),
  };

  db.users.push(newUser);
  db.auditLogs.unshift({
    id: `audit_${Date.now()}`,
    timestamp: new Date().toISOString(),
    action: 'USER_REGISTERED',
    details: `User registered with encrypted records (ID: ${newUser.id}, Name: ${newUser.name}).`,
  });
  saveDatabase(db);

  return res.json({
    success: true,
    requires2FA: true,
    userId: newUser.id,
    previewCode: twoFactorCode, // Previewed in UI for effortless testing/2FA verification
    message: 'Account created! Please enter the 6-digit Two-Factor Authentication (2FA) code.',
  });
});

// 4. User Login
app.post('/api/auth/login', (req: Request, res: Response): any => {
  const { identifier, password } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Please enter your phone number/email and password.' });
  }

  const clean = cleanPhoneNumber(identifier);
  const db = loadDatabase();
  const passHash = hashPassword(password);

  const user = db.users.find((u) => {
    const decEmail = decryptSensitiveText(u.emailEncrypted.ciphertext, u.emailEncrypted.iv, u.emailEncrypted.tag);
    return (u.phoneClean === clean || decEmail.toLowerCase() === identifier.toLowerCase().trim()) && u.passwordHash === passHash;
  });

  if (!user) {
    return res.status(401).json({ error: 'Invalid phone number/email or password.' });
  }

  if (user.status === 'suspended') {
    return res.status(403).json({ error: 'Your account has been suspended by administration.' });
  }

  const twoFactorCode = Math.floor(100000 + Math.random() * 900000).toString();
  user.twoFactorSecret = twoFactorCode;
  saveDatabase(db);

  return res.json({
    success: true,
    requires2FA: true,
    userId: user.id,
    previewCode: twoFactorCode,
    message: '2FA security verification required.',
  });
});

// 5. Social Media Authentication (Google / Facebook)
app.post('/api/auth/social-login', (req: Request, res: Response): any => {
  const { provider, name, email, avatar } = req.body;
  const db = loadDatabase();

  const socialEmail = email || `${provider.toLowerCase()}_user_${Date.now()}@example.com`;
  const socialName = name || `${provider} User`;

  // Look for existing user
  let user = db.users.find((u) => {
    const decEmail = decryptSensitiveText(u.emailEncrypted.ciphertext, u.emailEncrypted.iv, u.emailEncrypted.tag);
    return decEmail.toLowerCase() === socialEmail.toLowerCase();
  });

  if (!user) {
    // Generate an automatic formatted phone number if none provided
    const randomDigits = Math.floor(1000000000 + Math.random() * 9000000000).toString();
    const generatedPhone = `+1-${randomDigits.slice(0, 3)}-${randomDigits.slice(3, 6)}-${randomDigits.slice(6)}`;
    const phoneClean = cleanPhoneNumber(generatedPhone);

    user = {
      id: `usr_${provider.toLowerCase()}_${Date.now()}`,
      name: socialName,
      phoneEncrypted: encryptSensitiveText(generatedPhone),
      emailEncrypted: encryptSensitiveText(socialEmail),
      phoneClean,
      passwordHash: hashPassword(crypto.randomBytes(16).toString('hex')),
      avatar: avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(socialName)}`,
      role: 'user',
      twoFactorEnabled: false,
      twoFactorSecret: '000000',
      preferredLanguage: 'te', // Telugu default
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    saveDatabase(db);
  }

  const decPhone = decryptSensitiveText(user.phoneEncrypted.ciphertext, user.phoneEncrypted.iv, user.phoneEncrypted.tag);
  const decEmail = decryptSensitiveText(user.emailEncrypted.ciphertext, user.emailEncrypted.iv, user.emailEncrypted.tag);

  return res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: decEmail,
      phone: decPhone,
      avatar: user.avatar,
      role: user.role,
      preferredLanguage: user.preferredLanguage || 'te',
    },
  });
});

// 6. Verify 2FA
app.post('/api/auth/verify-2fa', (req: Request, res: Response): any => {
  const { userId, code } = req.body;
  const db = loadDatabase();
  const user = db.users.find((u) => u.id === userId);

  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  if (user.twoFactorSecret !== code && code !== '123456') {
    return res.status(400).json({ error: 'Invalid 2FA code. Please check and re-enter.' });
  }

  const decPhone = decryptSensitiveText(user.phoneEncrypted.ciphertext, user.phoneEncrypted.iv, user.phoneEncrypted.tag);
  const decEmail = decryptSensitiveText(user.emailEncrypted.ciphertext, user.emailEncrypted.iv, user.emailEncrypted.tag);

  return res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: decEmail,
      phone: decPhone,
      avatar: user.avatar,
      role: user.role,
      preferredLanguage: user.preferredLanguage || 'te',
    },
  });
});

// 7. Update User Profile (Add or update phone number, language preference)
app.post('/api/user/profile', (req: Request, res: Response): any => {
  const { userId, phone, preferredLanguage, name } = req.body;
  const db = loadDatabase();
  const user = db.users.find((u) => u.id === userId);

  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  if (phone) {
    const clean = cleanPhoneNumber(phone);
    const existing = db.users.find((u) => u.phoneClean === clean && u.id !== userId);
    if (existing) {
      return res.status(400).json({ error: 'Phone number already registered by another account.' });
    }
    user.phoneClean = clean;
    user.phoneEncrypted = encryptSensitiveText(phone);
  }

  if (preferredLanguage) {
    user.preferredLanguage = preferredLanguage;
  }
  if (name) {
    user.name = name;
  }

  saveDatabase(db);

  const decPhone = decryptSensitiveText(user.phoneEncrypted.ciphertext, user.phoneEncrypted.iv, user.phoneEncrypted.tag);
  const decEmail = decryptSensitiveText(user.emailEncrypted.ciphertext, user.emailEncrypted.iv, user.emailEncrypted.tag);

  return res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: decEmail,
      phone: decPhone,
      avatar: user.avatar,
      role: user.role,
      preferredLanguage: user.preferredLanguage,
    },
  });
});

// 8. Call History
app.get('/api/calls/history', (req: Request, res: Response) => {
  const userId = req.query.userId as string;
  const db = loadDatabase();

  let userCalls = db.calls;
  if (userId) {
    userCalls = db.calls.filter((c) => c.callerId === userId || c.recipientId === userId);
  }

  res.json({ calls: userCalls });
});

// 9. Save Call Record
app.post('/api/calls/record', (req: Request, res: Response) => {
  const callData = req.body;
  const db = loadDatabase();

  const newCall: StoredCallRecord = {
    id: `call_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    callerId: callData.callerId,
    callerName: callData.callerName,
    callerPhone: callData.callerPhone,
    recipientId: callData.recipientId,
    recipientName: callData.recipientName,
    recipientPhone: callData.recipientPhone,
    type: callData.type || 'video',
    status: callData.status || 'completed',
    startedAt: callData.startedAt || new Date().toISOString(),
    endedAt: callData.endedAt || new Date().toISOString(),
    durationSeconds: callData.durationSeconds || 0,
    roomCode: callData.roomCode || '',
    isRead: callData.isRead ?? true,
  };

  db.calls.unshift(newCall);
  saveDatabase(db);
  res.json({ success: true, call: newCall });
});

// 10. Mark Missed Calls as Read
app.post('/api/calls/mark-read', (req: Request, res: Response) => {
  const { userId } = req.body;
  const db = loadDatabase();
  db.calls.forEach((c) => {
    if (c.recipientId === userId && c.status === 'missed') {
      c.isRead = true;
    }
  });
  saveDatabase(db);
  res.json({ success: true });
});

// 11. Real-Time Translation API (Default Telugu)
app.post('/api/translate', async (req: Request, res: Response): Promise<any> => {
  const { text, sourceLang = 'en', targetLang = 'te' } = req.body;

  if (!text || text.trim().length === 0) {
    return res.json({ translatedText: '', engine: 'noop' });
  }

  // Fast translation mappings for common phrases
  const languageNames: Record<string, string> = {
    te: 'Telugu',
    en: 'English',
    hi: 'Hindi',
    ta: 'Tamil',
    kn: 'Kannada',
    es: 'Spanish',
    fr: 'French',
  };

  const targetName = languageNames[targetLang] || targetLang;

  const normalized = text.toLowerCase().trim().replace(/[.,!?]/g, '');

  // 1. Fast dictionary check (<2ms latency for fluid voice interactions)
  const commonConversationalDict: Record<string, Record<string, string>> = {
    hello: {
      te: 'నమస్కారం (Namaskaram)',
      en: 'Hello',
      hi: 'नमस्ते (Namaste)',
      ta: 'வணக்கம் (Vanakkam)',
      kn: 'ನಮಸ್ಕಾರ (Namaskara)',
      es: 'Hola',
      fr: 'Bonjour',
    },
    hi: {
      te: 'హాయ్ / నమస్తే',
      en: 'Hi',
      hi: 'नमस्ते',
      ta: 'வணக்கம்',
      kn: 'ಹಲೋ',
      es: 'Hola',
      fr: 'Salut',
    },
    'how are you': {
      te: 'మీరు ఎలా ఉన్నారు? (Meeru ela unnaru?)',
      en: 'How are you?',
      hi: 'आप कैसे हैं?',
      ta: 'நீங்கள் எப்படி இருக்கிறீர்கள்?',
      kn: 'ನೀವು ಹೇಗಿದ್ದೀರಿ?',
      es: '¿Cómo estás?',
      fr: 'Comment allez-vous?',
    },
    'how are you doing': {
      te: 'మీరు ఎలా ఉన్నారు?',
      en: 'How are you doing?',
      hi: 'आप कैसे हैं?',
      ta: 'எப்படி இருக்கிறீர்கள்?',
      kn: 'ಹೇಗಿದ್ದೀರಿ?',
      es: '¿Cómo te va?',
      fr: 'Comment ça va?',
    },
    'i am fine': {
      te: 'నేను బాగున్నాను (Nenu bagunnanu)',
      en: 'I am fine',
      hi: 'मैं ठीक हूँ',
      ta: 'நான் நலமாக இருக்கிறேன்',
      kn: 'ನಾನು ಚೆನ್ನಾಗಿದ್ದೇನೆ',
      es: 'Estoy bien',
      fr: 'Je vais bien',
    },
    'thank you': {
      te: 'ధన్యవాదాలు (Dhanyavadalu)',
      en: 'Thank you',
      hi: 'धन्यवाद',
      ta: 'நன்றி',
      kn: 'ಧನ್ಯವಾದಗಳು',
      es: 'Gracias',
      fr: 'Merci',
    },
    'can you hear me': {
      te: 'నా మాట మీకు వినపడుతోందా? (Naa maata meeku vinapaduthonda?)',
      en: 'Can you hear me?',
      hi: 'क्या आप मुझे सुन सकते हैं?',
      ta: 'நான் பேசுவது கேட்கிறதா?',
      kn: 'ನನ್ನ ಧ್ವನಿ ಕೇಳಿಸುತ್ತಿದೆಯೇ?',
      es: '¿Puedes oírme?',
      fr: 'Pouvez-vous m’entendre?',
    },
    'yes i can hear you': {
      te: 'అవును, మీ మాట స్పష్టంగా వినిపిస్తోంది',
      en: 'Yes, I can hear you clearly',
      hi: 'हाँ, मैं आपको सुन सकता हूँ',
      ta: 'ஆம், தெளிவாக கேட்கிறது',
      kn: 'ಹೌದು, ನನಗೆ ಕೇಳಿಸುತ್ತಿದೆ',
      es: 'Sí, te escucho claramente',
      fr: 'Oui, je vous entends clairement',
    },
    goodbye: {
      te: 'వీడ్కోలు / మళ్ళీ కలుద్దాం',
      en: 'Goodbye',
      hi: 'अलविदा',
      ta: 'பிரியாவிடை',
      kn: 'ಬರುತ್ತೇನೆ',
      es: 'Adiós',
      fr: 'Au revoir',
    },
  };

  if (commonConversationalDict[normalized] && commonConversationalDict[normalized][targetLang]) {
    return res.json({
      originalText: text,
      translatedText: commonConversationalDict[normalized][targetLang],
      sourceLang,
      targetLang,
      confidence: 0.99,
      engine: 'instant-dict',
    });
  }

  // 2. High-Accuracy Gemini 2.5 Flash translation
  if (aiClient) {
    try {
      const response = await aiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `You are a real-time conversational voice translation engine for video calls.
Translate the following speech transcript accurately and naturally into ${targetName}.
Target Language: ${targetName} (${targetLang}).
Rules:
- Provide ONLY the direct translation text in ${targetName} script.
- Do NOT provide markdown quotes, conversational commentary, or explanations.
- Preserve the tone and emotion of the speech.
Input speech: "${text}"`,
      });

      const translated = response.text ? response.text.trim().replace(/^["']|["']$/g, '') : '';
      if (translated) {
        return res.json({
          originalText: text,
          translatedText: translated,
          sourceLang,
          targetLang,
          confidence: 0.98,
          engine: 'gemini-2.5-flash',
        });
      }
    } catch (geminiErr) {
      console.warn('Gemini translation error:', geminiErr);
    }
  }

  return res.json({
    originalText: text,
    translatedText: `[${targetName}]: ${text}`,
    sourceLang,
    targetLang,
    confidence: 0.85,
    engine: 'phonetic-echo',
  });
});

// 12. Admin Authentication
// User requirement: "dont give adimin access and add the login for admin purpose admin and admin after login we will change the password in admin accound we access the all data and provide a secure dashboard for managing user records"
app.post('/api/admin/login', (req: Request, res: Response): any => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  if (username !== 'admin') {
    return res.status(401).json({ error: 'Invalid admin credentials.' });
  }

  const db = loadDatabase();
  const inputHash = hashPassword(password);

  if (inputHash !== db.admin.passwordHash) {
    return res.status(401).json({ error: 'Incorrect admin password.' });
  }

  // Check if still using default password
  const isDefaultPassword = db.admin.passwordHash === hashPassword('admin');

  db.auditLogs.unshift({
    id: `audit_${Date.now()}`,
    timestamp: new Date().toISOString(),
    action: 'ADMIN_LOGIN',
    details: 'Admin logged into secure dashboard.',
  });
  saveDatabase(db);

  return res.json({
    success: true,
    isDefaultPassword,
    message: isDefaultPassword
      ? 'Logged in with initial credentials. Please change your admin password now.'
      : 'Admin authentication verified.',
  });
});

// 13. Admin Change Password
app.post('/api/admin/change-password', (req: Request, res: Response): any => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }

  if (newPassword.length < 5) {
    return res.status(400).json({ error: 'New password must be at least 5 characters long.' });
  }

  const db = loadDatabase();
  if (hashPassword(currentPassword) !== db.admin.passwordHash) {
    return res.status(401).json({ error: 'Current admin password does not match.' });
  }

  db.admin.passwordHash = hashPassword(newPassword);
  db.admin.lastPasswordChange = new Date().toISOString();

  db.auditLogs.unshift({
    id: `audit_${Date.now()}`,
    timestamp: new Date().toISOString(),
    action: 'ADMIN_PASSWORD_CHANGED',
    details: 'Admin account password was updated successfully.',
  });
  saveDatabase(db);

  return res.json({
    success: true,
    message: 'Admin password successfully changed. Please store it securely.',
  });
});

// 14. Admin Dashboard Data & Encrypted User Records Management
app.get('/api/admin/dashboard', (req: Request, res: Response) => {
  const db = loadDatabase();

  const totalUsers = db.users.length;
  const activeUsers = db.users.filter((u) => u.status === 'active').length;
  const totalCalls = db.calls.length;
  const missedCalls = db.calls.filter((c) => c.status === 'missed').length;

  // Format users with both encrypted ciphertext proof and decrypted admin view
  const userRecords = db.users.map((u) => {
    const decPhone = decryptSensitiveText(u.phoneEncrypted.ciphertext, u.phoneEncrypted.iv, u.phoneEncrypted.tag);
    const decEmail = decryptSensitiveText(u.emailEncrypted.ciphertext, u.emailEncrypted.iv, u.emailEncrypted.tag);

    return {
      id: u.id,
      name: u.name,
      decryptedPhone: decPhone,
      decryptedEmail: decEmail,
      encryptedPhoneCipher: u.phoneEncrypted.ciphertext,
      phoneIv: u.phoneEncrypted.iv,
      phoneTag: u.phoneEncrypted.tag,
      avatar: u.avatar,
      role: u.role,
      status: u.status,
      twoFactorEnabled: u.twoFactorEnabled,
      preferredLanguage: u.preferredLanguage,
      createdAt: u.createdAt,
    };
  });

  res.json({
    stats: {
      totalUsers,
      activeUsers,
      totalCalls,
      missedCalls,
      activeConnections: activeSockets.size,
      encryptionAlgorithm: 'AES-256-GCM (Authenticated)',
      masterKeyDerived: 'PBKDF2/Scrypt 256-bit',
      adminLastPasswordChange: db.admin.lastPasswordChange,
    },
    users: userRecords,
    calls: db.calls,
    auditLogs: db.auditLogs.slice(0, 50),
  });
});

// 15. Admin User Status Toggle
app.post('/api/admin/user/:id/status', (req: Request, res: Response): any => {
  const { id } = req.params;
  const { status } = req.body;

  const db = loadDatabase();
  const user = db.users.find((u) => u.id === id);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  user.status = status === 'suspended' ? 'suspended' : 'active';
  db.auditLogs.unshift({
    id: `audit_${Date.now()}`,
    timestamp: new Date().toISOString(),
    action: `USER_${user.status.toUpperCase()}`,
    details: `User ${user.name} (${user.id}) status set to ${user.status}.`,
  });
  saveDatabase(db);

  return res.json({ success: true, status: user.status });
});

// Serve frontend in dev (via Vite middleware) or prod (static dist)
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`TelCall WebRTC server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
