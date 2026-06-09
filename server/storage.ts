// In-memory or simple disk-persisted datastore
import fs from 'fs';
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
  users: Map<string, User> = new Map();
  usernamesMap: Map<string, string> = new Map(); // username -> userId
  chats: Map<string, Chat> = new Map();
  messages: Map<string, Message> = new Map(); // messageId -> Message
  contactRequests: Map<string, ContactRequest> = new Map();

  // Load from disk if available
  constructor() {
    this.load();
  }

  private getFilePath() {
    return path.join(process.cwd(), 'db.json');
  }

  save() {
    try {
      const data = {
        users: Array.from(this.users.entries()),
        usernamesMap: Array.from(this.usernamesMap.entries()),
        chats: Array.from(this.chats.entries()),
        messages: Array.from(this.messages.entries()),
        contactRequests: Array.from(this.contactRequests.entries()),
      };
      fs.writeFileSync(this.getFilePath(), JSON.stringify(data));
    } catch (e) {
      console.error("Failed to save DB:", e);
    }
  }

  load() {
    try {
      if (fs.existsSync(this.getFilePath())) {
        const data = JSON.parse(fs.readFileSync(this.getFilePath(), 'utf-8'));
        this.users = new Map(data.users);
        this.usernamesMap = new Map(data.usernamesMap);
        this.chats = new Map(data.chats);
        this.messages = new Map(data.messages);
        if (data.contactRequests) this.contactRequests = new Map(data.contactRequests);
      }
    } catch (e) {
        console.error("Failed to load DB:", e);
    }
  }

  // API

  createUser(id: string, username: string): User | null {
    if (this.usernamesMap.has(username)) return null;
    const user = { id, username, contacts: [] };
    this.users.set(id, user);
    this.usernamesMap.set(username, id);
    this.save();
    return user;
  }

  getUser(id: string): User | undefined {
    return this.users.get(id);
  }

  getUserByUsername(username: string): User | undefined {
    const id = this.usernamesMap.get(username);
    if (!id) return undefined;
    return this.users.get(id);
  }
  
  getSearchUsers(query: string, excludeId: string): User[] {
    const results: User[] = [];
    for (const user of this.users.values()) {
        if (user.id !== excludeId && user.username.toLowerCase().includes(query.toLowerCase())) {
            results.push(user);
        }
    }
    return results;
  }

  createChat(id: string, participants: string[]): Chat {
    const chat = { id, participants, updatedAt: Date.now() };
    this.chats.set(id, chat);
    this.save();
    return chat;
  }

  getChat(id: string): Chat | undefined {
    return this.chats.get(id);
  }

  getUserChats(userId: string): Chat[] {
    return Array.from(this.chats.values()).filter(c => c.participants.includes(userId));
  }
  
  getChatByParticipants(participants: string[]): Chat | undefined {
    return Array.from(this.chats.values()).find(c => {
      return c.participants.length === participants.length && 
             participants.every(p => c.participants.includes(p));
    });
  }

  addMessage(msg: Message) {
    this.messages.set(msg.id, msg);
    const chat = this.chats.get(msg.chatId);
    if (chat) {
      chat.lastMessage = msg.text;
      chat.updatedAt = msg.timestamp;
    }
    this.save();
  }

  getChatMessages(chatId: string): Message[] {
    return Array.from(this.messages.values())
      .filter(m => m.chatId === chatId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }
  // Contact Requests

  createContactRequest(id: string, senderId: string, receiverId: string): ContactRequest {
    const req = { id, senderId, receiverId, status: 'pending' as const, timestamp: Date.now() };
    this.contactRequests.set(id, req);
    this.save();
    return req;
  }

  getPendingRequestsForUser(userId: string): ContactRequest[] {
    return Array.from(this.contactRequests.values())
      .filter(r => r.receiverId === userId && r.status === 'pending');
  }

  acceptContactRequest(requestId: string): ContactRequest | null {
    const req = this.contactRequests.get(requestId);
    if (!req) return null;
    req.status = 'accepted';
    
    // Add to contacts
    const sender = this.users.get(req.senderId);
    const receiver = this.users.get(req.receiverId);
    
    if (sender && receiver) {
      if (!sender.contacts) sender.contacts = [];
      if (!receiver.contacts) receiver.contacts = [];
      if (!sender.contacts.includes(receiver.id)) sender.contacts.push(receiver.id);
      if (!receiver.contacts.includes(sender.id)) receiver.contacts.push(sender.id);
    }
    
    this.save();
    return req;
  }

  rejectContactRequest(requestId: string): ContactRequest | null {
    const req = this.contactRequests.get(requestId);
    if (!req) return null;
    req.status = 'rejected';
    this.save();
    return req;
  }

  getContactRequestBetween(user1: string, user2: string): ContactRequest | undefined {
    return Array.from(this.contactRequests.values()).find(r => 
      (r.senderId === user1 && r.receiverId === user2) ||
      (r.senderId === user2 && r.receiverId === user1)
    );
  }
}

export const db = new Storage();
