import { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import { useNavigate, Routes, Route, useLocation } from 'react-router-dom';
import { socket } from '../socket';
import Sidebar from '../components/Sidebar';
import ChatArea from '../components/ChatArea';
import { MessageCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import type { Chat } from '../types';

export default function Dashboard() {
  const { currentUser, setCurrentUser } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [chats, setChats] = useState<Chat[]>([]);
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
      });

    socket.connect();
    socket.emit('auth', currentUser.id);

    fetch(`/api/chats/${currentUser.id}`)
      .then(res => res.json())
      .then(data => {
        setChats(data);
      });

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

  if (!currentUser) return null;

  return (
    <div className="h-screen w-full bg-gradient-to-tr from-sky-400 via-indigo-400 to-purple-500 flex items-center justify-center font-sans overflow-hidden lg:p-8">
      <div className="flex-1 w-full flex bg-white/10 backdrop-blur-xl lg:rounded-3xl shadow-2xl lg:border border-white/20 overflow-hidden relative">
        {/* Sidebar - hidden on mobile if chat route is active */}
        <div className={cn(
          "w-full lg:w-96 flex-shrink-0 border-r border-white/10 z-10",
          isChatRoute ? "hidden lg:block" : "block"
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
          "flex-1 flex flex-col relative",
          !isChatRoute ? "hidden lg:flex" : "flex"
        )}>
          <Routes>
            <Route path="/chat/:chatId" element={<ChatArea />} />
            <Route path="/" element={
              <div className="flex-1 flex flex-col items-center justify-center text-white/40">
                <MessageCircle className="w-16 h-16 mb-4 text-white/30" />
                <h2 className="text-xl font-medium text-white/60">Select a chat to start messaging</h2>
              </div>
            } />
          </Routes>
        </div>
      </div>
    </div>
  );
}
