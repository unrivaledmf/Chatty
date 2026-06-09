import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { ArrowLeft, Send } from 'lucide-react';
import { socket } from '../socket';
import { cn } from '../lib/utils';
import type { Message, Chat } from '../types';
import { motion, AnimatePresence } from 'motion/react';

export default function ChatArea() {
  const { chatId } = useParams();
  const { currentUser, usersCache, addUserToCache } = useAppStore();
  const navigate = useNavigate();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [chat, setChat] = useState<Chat | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chatId || !currentUser) return;

    // Join room
    socket.emit('joinChat', chatId);

    // Fetch initial chat data
    let otherId: string;
    fetch(`/api/chats/${currentUser.id}`)
      .then(res => res.json())
      .then((data: Chat[]) => {
        const c = data.find(ch => ch.id === chatId);
        if (c) {
          setChat(c);
          otherId = c.participants.find(p => p !== currentUser.id)!;
          if (otherId && !usersCache[otherId]) {
            fetch(`/api/users/${otherId}`)
              .then(r => r.json())
              .then(u => addUserToCache(u));
          }
        }
      });

    // Fetch initial messages
    fetch(`/api/chats/${chatId}/messages`)
      .then(res => res.json())
      .then(setMessages);

    const handleNewMessage = (msg: Message) => {
      setMessages(prev => {
        if (prev.find(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };

    socket.on('newMessage', handleNewMessage);

    return () => {
      socket.off('newMessage', handleNewMessage);
      socket.emit('leaveChat', chatId);
    };
  }, [chatId, currentUser]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !chatId || !currentUser) return;
    
    // Optimistic / send
    socket.emit('sendMessage', {
      chatId,
      senderId: currentUser.id,
      text: text.trim(),
    });
    
    setText('');
  };

  const otherId = chat?.participants.find(p => p !== currentUser?.id);
  const otherUser = otherId ? usersCache[otherId] : null;

  return (
    <div className="flex-1 flex flex-col h-full bg-transparent relative z-20">
      <div className="p-4 border-b border-white/10 flex items-center gap-4 bg-white/5 backdrop-blur-sm sticky top-0 z-10 shrink-0">
        <button onClick={() => navigate('/')} className="lg:hidden p-2 -ml-2 rounded-full hover:bg-white/10 text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        {otherUser ? (
          <>
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white font-bold tracking-tight text-sm">
              {otherUser.username.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="font-semibold text-white leading-tight">{otherUser.username}</h2>
              <p className="text-xs text-emerald-400 font-medium">Online now</p>
            </div>
          </>
        ) : (
          <div className="w-10 h-10 rounded-full bg-white/10 animate-pulse" />
        )}
      </div>

      <div className="flex-1 p-6 space-y-4 overflow-y-auto">
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => {
            const isMe = msg.senderId === currentUser?.id;
            const showTail = i === messages.length - 1 || messages[i + 1].senderId !== msg.senderId;
            
            return (
              <motion.div 
                key={msg.id}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                layout
                className={cn(
                  "flex w-full",
                  isMe ? "justify-end" : "justify-start"
                )}
              >
                <div className={cn(
                  "px-4 py-2 max-w-[70%] sm:max-w-[70%] text-sm leading-relaxed",
                  isMe 
                    ? "bg-blue-600 text-white rounded-2xl" 
                    : "bg-white/20 text-white rounded-2xl",
                  showTail && isMe ? "rounded-br-none" : "",
                  showTail && !isMe ? "rounded-bl-none" : ""
                )}>
                  {msg.text}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={bottomRef} className="h-2" />
      </div>

      <div className="p-6 pt-0 shrink-0 pb-safe">
        <form onSubmit={send} className="flex gap-2 items-center max-w-4xl mx-auto bg-white/10 backdrop-blur-md border border-white/20 rounded-full px-4 py-2 shadow-inner focus-within:ring-2 focus-within:ring-blue-400">
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="iMessage-style text..."
            className="flex-1 bg-transparent border-none text-white focus:outline-none py-2 text-sm placeholder-white/40"
          />
          <button 
            type="submit" 
            disabled={!text.trim()}
            className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-400 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100 flex-shrink-0"
          >
            <svg className="w-4 h-4 transform rotate-90" fill="currentColor" viewBox="0 0 20 20"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/></svg>
          </button>
        </form>
      </div>
    </div>
  );
}
