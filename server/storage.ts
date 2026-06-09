import Database from 'better-sqlite3';
import path from 'path';

export interface User {
  id: string;
  username: string;
  contacts: string[];
}

export interface ContactRequest {
  id: string;
  senderId: string;
  receiverId: string;
  status: 'pending' | 'accepted' | 'rejected';
  timestamp: number;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  timestamp: number;
}

export interface Chat {
  id: string;
  participants: string[];
  lastMessage?: string;
  updatedAt: number;
}

export class Storage {
  private db: Database.Database;

  constructor() {
    this.db = new Database(path.join(process.cwd(), 'chat_app.sqlite'));
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE
      );

      CREATE TABLE IF NOT EXISTS contacts (
        user_id TEXT,
        contact_id TEXT,
        PRIMARY KEY (user_id, contact_id)
      );

      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        last_message TEXT,
        updated_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS chat_participants (
        chat_id TEXT,
        user_id TEXT,
        PRIMARY KEY (chat_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT,
        sender_id TEXT,
        text TEXT,
        timestamp INTEGER
      );

      CREATE TABLE IF NOT EXISTS contact_requests (
        id TEXT PRIMARY KEY,
        sender_id TEXT,
        receiver_id TEXT,
        status TEXT,
        timestamp INTEGER
      );
    `);
  }

  // --- API ---
  createUser(id: string, username: string): User | null {
    try {
      this.db.prepare('INSERT INTO users (id, username) VALUES (?, ?)').run(id, username);
      return { id, username, contacts: [] };
    } catch {
      return null;
    }
  }

  getUser(id: string): User | undefined {
    const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    if (!user) return undefined;
    const contacts = this.db.prepare('SELECT contact_id FROM contacts WHERE user_id = ?').all(id) as any[];
    return { id: user.id, username: user.username, contacts: contacts.map(c => c.contact_id) };
  }

  getUserByUsername(username: string): User | undefined {
    const user = this.db.prepare('SELECT id FROM users WHERE username = ?').get(username) as any;
    if (!user) return undefined;
    return this.getUser(user.id);
  }

  getSearchUsers(query: string, excludeId: string): User[] {
    const users = this.db.prepare('SELECT * FROM users WHERE id != ? AND username LIKE ? LIMIT 50')
      .all(excludeId, `%${query}%`) as any[];
    
    return users.map(u => {
      const contacts = this.db.prepare('SELECT contact_id FROM contacts WHERE user_id = ?').all(u.id) as any[];
      return { id: u.id, username: u.username, contacts: contacts.map(c => c.contact_id) };
    });
  }

  createChat(id: string, participants: string[]): Chat {
    const transaction = this.db.transaction(() => {
      this.db.prepare('INSERT INTO chats (id, updated_at) VALUES (?, ?)').run(id, Date.now());
      const insertParticipant = this.db.prepare('INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)');
      for (const p of participants) {
        insertParticipant.run(id, p);
      }
    });
    transaction();
    return { id, participants, updatedAt: Date.now() };
  }

  getChat(id: string): Chat | undefined {
    const chatRow = this.db.prepare('SELECT * FROM chats WHERE id = ?').get(id) as any;
    if (!chatRow) return undefined;
    
    const participants = this.db.prepare('SELECT user_id FROM chat_participants WHERE chat_id = ?').all(id) as any[];
    return {
      id: chatRow.id,
      lastMessage: chatRow.last_message || undefined,
      updatedAt: chatRow.updated_at,
      participants: participants.map(p => p.user_id)
    };
  }

  getUserChats(userId: string): Chat[] {
    const chatRows = this.db.prepare(`
      SELECT c.* FROM chats c
      JOIN chat_participants cp ON c.id = cp.chat_id
      WHERE cp.user_id = ?
      ORDER BY c.updated_at DESC
    `).all(userId) as any[];

    return chatRows.map(row => {
      const participants = this.db.prepare('SELECT user_id FROM chat_participants WHERE chat_id = ?').all(row.id) as any[];
      return {
        id: row.id,
        lastMessage: row.last_message || undefined,
        updatedAt: row.updated_at,
        participants: participants.map(p => p.user_id)
      };
    });
  }

  getChatByParticipants(participants: string[]): Chat | undefined {
    if (participants.length === 0) return undefined;
    const chats = this.getUserChats(participants[0]);
    return chats.find(c => 
      c.participants.length === participants.length && 
      participants.every(p => c.participants.includes(p))
    );
  }

  addMessage(msg: Message) {
    const transaction = this.db.transaction(() => {
      this.db.prepare(
        'INSERT INTO messages (id, chat_id, sender_id, text, timestamp) VALUES (?, ?, ?, ?, ?)'
      ).run(msg.id, msg.chatId, msg.senderId, msg.text, msg.timestamp);
      
      this.db.prepare(
        'UPDATE chats SET last_message = ?, updated_at = ? WHERE id = ?'
      ).run(msg.text, msg.timestamp, msg.chatId);
    });
    transaction();
  }

  getChatMessages(chatId: string): Message[] {
    const msgs = this.db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp ASC').all(chatId) as any[];
    return msgs.map(m => ({
      id: m.id,
      chatId: m.chat_id,
      senderId: m.sender_id,
      text: m.text,
      timestamp: m.timestamp
    }));
  }

  // Contact Requests
  createContactRequest(id: string, senderId: string, receiverId: string): ContactRequest {
    this.db.prepare(
      'INSERT INTO contact_requests (id, sender_id, receiver_id, status, timestamp) VALUES (?, ?, ?, ?, ?)'
    ).run(id, senderId, receiverId, 'pending', Date.now());
    return { id, senderId, receiverId, status: 'pending', timestamp: Date.now() };
  }

  getPendingRequestsForUser(userId: string): ContactRequest[] {
    const reqs = this.db.prepare('SELECT * FROM contact_requests WHERE receiver_id = ? AND status = ?').all(userId, 'pending') as any[];
    return reqs.map(r => ({
      id: r.id,
      senderId: r.sender_id,
      receiverId: r.receiver_id,
      status: r.status,
      timestamp: r.timestamp
    }));
  }

  getOutgoingPendingRequestsForUser(userId: string): ContactRequest[] {
    const reqs = this.db.prepare('SELECT * FROM contact_requests WHERE sender_id = ? AND status = ?').all(userId, 'pending') as any[];
    return reqs.map(r => ({
      id: r.id,
      senderId: r.sender_id,
      receiverId: r.receiver_id,
      status: r.status,
      timestamp: r.timestamp
    }));
  }

  acceptContactRequest(requestId: string): ContactRequest | null {
    const row = this.db.prepare('SELECT * FROM contact_requests WHERE id = ?').get(requestId) as any;
    if (!row) return null;
    
    const transaction = this.db.transaction(() => {
      this.db.prepare('UPDATE contact_requests SET status = ? WHERE id = ?').run('accepted', requestId);
      this.db.prepare('INSERT OR IGNORE INTO contacts (user_id, contact_id) VALUES (?, ?)').run(row.sender_id, row.receiver_id);
      this.db.prepare('INSERT OR IGNORE INTO contacts (user_id, contact_id) VALUES (?, ?)').run(row.receiver_id, row.sender_id);
    });
    transaction();
    
    return {
      id: row.id,
      senderId: row.sender_id,
      receiverId: row.receiver_id,
      status: 'accepted',
      timestamp: row.timestamp
    };
  }

  rejectContactRequest(requestId: string): ContactRequest | null {
    const row = this.db.prepare('SELECT * FROM contact_requests WHERE id = ?').get(requestId) as any;
    if (!row) return null;
    this.db.prepare('UPDATE contact_requests SET status = ? WHERE id = ?').run('rejected', requestId);
    
    return {
      id: row.id,
      senderId: row.sender_id,
      receiverId: row.receiver_id,
      status: 'rejected',
      timestamp: row.timestamp
    };
  }

  getContactRequestBetween(user1: string, user2: string): ContactRequest | undefined {
    const row = this.db.prepare(`
      SELECT * FROM contact_requests 
      WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
      ORDER BY timestamp DESC
      LIMIT 1
    `).get(user1, user2, user2, user1) as any;
    
    if (!row) return undefined;
    return {
      id: row.id,
      senderId: row.sender_id,
      receiverId: row.receiver_id,
      status: row.status,
      timestamp: row.timestamp
    };
  }

  updateContactRequestStatus(requestId: string, status: string, senderId: string, receiverId: string) {
    this.db.prepare('UPDATE contact_requests SET status = ?, sender_id = ?, receiver_id = ?, timestamp = ? WHERE id = ?')
        .run(status, senderId, receiverId, Date.now(), requestId);
  }
}

export const db = new Storage();
