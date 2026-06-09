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
