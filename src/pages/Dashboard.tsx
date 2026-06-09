import { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import { useNavigate, Routes, Route, useLocation } from 'react-router-dom';
import { socket } from '../socket';
import Sidebar from '../components/Sidebar';
import ChatArea from '../components/ChatArea';
import { MessageCircle, X } from 'lucide-react';
import { cn } from '../lib/utils';
import type { Chat } from '../types';
import { motion, AnimatePresence } from 'motion/react';

export default function Dashboard() {
  const { currentUser, setCurrentUser, usersCache } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [chats, setChats] = useState<Chat[]>([]);
  const [toastMessage, setToastMessage] = useState<{ id: string, text: string, senderName: string, chatId: string } | null>(null);
  const isChatRoute = location.pathname.startsWith('/chat/');

  useEffect(() => {
    if (!currentUser) {
      navigate('/register');
      return;
    }

    // Refresh user state
    fetch(`/api/users/${currentUser.id}`)
      .then(res => res.json())
      .then(user => {
        if (user) setCurrentUser(user);
      })
      .catch(console.error);

    socket.connect();
    socket.emit('auth', currentUser.id);

    fetch(`/api/chats/${currentUser.id}`)
      .then(res => res.json())
      .then(data => {
        setChats(data);
      })
      .catch(console.error);

    const handleChatUpdated = (chat: Chat) => {
      setChats(prev => {
        const existing = prev.find(c => c.id === chat.id);
        if (existing) {
          return prev.map(c => c.id === chat.id ? chat : c).sort((a,b) => b.updatedAt - a.updatedAt);
        }
        return [chat, ...prev].sort((a,b) => b.updatedAt - a.updatedAt);
      });
    };

    socket.on('chatUpdated', handleChatUpdated);

    return () => {
      socket.off('chatUpdated', handleChatUpdated);
      socket.disconnect();
    };
  }, [currentUser, navigate]);

  useEffect(() => {
    const handleNotification = (data: { chatId: string, senderId: string, text: string }) => {
        // Find if we are currently looking at this chat
        const currentPath = window.location.pathname;
        if (currentPath === `/chat/${data.chatId}`) {
            return; // Already viewing this chat
        }
        
        // Show toast
        const sender = useAppStore.getState().usersCache[data.senderId];
        const senderName = sender ? sender.username : 'Someone';
        const id = Date.now().toString();
        setToastMessage({
            id,
            text: data.text,
            senderName,
            chatId: data.chatId
        });
        
        // Auto dismiss after 4s
        setTimeout(() => {
            setToastMessage(prev => prev?.id === id ? null : prev);
        }, 4000);
    };

    socket.on('userNotification', handleNotification);
    return () => {
        socket.off('userNotification', handleNotification);
    };
  }, []);

  if (!currentUser) return null;

  return (
    <div className="h-[100dvh] w-full bg-gradient-to-tr from-gray-950 via-slate-900 to-zinc-950 flex items-center justify-center font-sans overflow-hidden lg:p-8">
      <div className="w-full h-full max-w-7xl flex flex-col lg:flex-row bg-white/5 backdrop-blur-xl lg:rounded-3xl shadow-2xl lg:border border-white/10 overflow-hidden relative">
        {/* Sidebar - hidden on mobile if chat route is active */}
        <div className={cn(
          "w-full h-full lg:w-96 flex-shrink-0 border-r border-white/10 z-10",
          isChatRoute ? "hidden lg:block" : "block flex-1"
        )}>
          <Sidebar chats={chats} onNewChat={(chat) => {
              setChats(prev => {
                  if (prev.find(c => c.id === chat.id)) return prev;
                  return [chat, ...prev].sort((a,b) => b.updatedAt - a.updatedAt);
              });
              navigate(`/chat/${chat.id}`);
          }} />
        </div>

        {/* Chat Area - hidden on mobile if not in a chat route */}
        <div className={cn(
          "flex-1 w-full h-full flex flex-col relative",
          !isChatRoute ? "hidden lg:flex" : "flex"
        )}>
          <Routes>
            <Route path="chat/:chatId" element={<ChatArea />} />
            <Route path="*" element={
              <div className="flex-1 flex flex-col items-center justify-center text-white/40">
                <MessageCircle className="w-16 h-16 mb-4 text-white/20" />
                <h2 className="text-xl font-medium text-white/50">Select a chat to start messaging</h2>
              </div>
            } />
          </Routes>
        </div>
      </div>

      {/* Toast Notification Layer */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
         <AnimatePresence>
            {toastMessage && (
                <motion.div
                    initial={{ opacity: 0, y: -20, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                    className="p-4 bg-gray-800/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl flex items-center justify-between gap-4 max-w-sm"
                    role="alert"
                >
                    <div 
                       className="flex-1 min-w-0 cursor-pointer"
                       onClick={() => {
                          navigate(`/chat/${toastMessage.chatId}`);
                          setToastMessage(null);
                       }}
                    >
                        <p className="font-semibold text-white text-sm">New message from @{toastMessage.senderName}</p>
                        <p className="text-white/70 text-sm truncate">{toastMessage.text}</p>
                    </div>
                    <button 
                       onClick={() => setToastMessage(null)}
                       className="p-1 rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors flex-shrink-0"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </motion.div>
            )}
         </AnimatePresence>
      </div>
    </div>
  );
}
