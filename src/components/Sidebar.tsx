import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import { Search, Edit, X, UserPlus, Check, Clock } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import type { Chat, User, ContactRequest } from '../types';
import { cn } from '../lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { socket } from '../socket';

export default function Sidebar({ chats, onNewChat }: { chats: Chat[], onNewChat: (c: Chat) => void }) {
  const { currentUser, setCurrentUser, usersCache, addUserToCache } = useAppStore();
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState<'chats'|'contacts'>('chats');
  const [requests, setRequests] = useState<{incoming: ContactRequest[], outgoing: ContactRequest[]}>({ incoming: [], outgoing: [] });
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchRequests = () => {
    if (!currentUser) return;
    fetch(`/api/contacts/requests/pending/${currentUser.id}`)
        .then(res => res.json())
        .then(data => {
            setRequests(data || {incoming: [], outgoing: []});
            // Also refresh user to get exact contacts lists
            return fetch(`/api/users/${currentUser.id}`);
        })
        .then(res => res.json())
        .then(user => setCurrentUser(user))
        .catch(console.error);
  };

  useEffect(() => {
    fetchRequests();
    
    // Auto refresh users info for incoming requests
    requests.incoming.forEach(req => {
        if (!usersCache[req.senderId]) {
            fetch(`/api/users/${req.senderId}`).then(r => r.json()).then(u => addUserToCache(u));
        }
    });
  }, [currentUser?.id]); // Only on mount

  useEffect(() => {
    const handler = () => fetchRequests();
    socket.on('contactRequest', handler);
    socket.on('contactAccepted', handler);
    socket.on('contactRejected', handler);
    return () => {
        socket.off('contactRequest', handler);
        socket.off('contactAccepted', handler);
        socket.off('contactRejected', handler);
    };
  }, []);

  // Load participants data
  useEffect(() => {
    chats.forEach(chat => {
      const otherId = chat.participants.find(p => p !== currentUser?.id);
      if (otherId && !usersCache[otherId]) {
        fetch(`/api/users/${otherId}`)
          .then(res => res.ok ? res.json() : null)
          .then(user => user && addUserToCache(user));
      }
    });
  }, [chats, currentUser?.id, usersCache, addUserToCache]);

  // Handle search overlay
  useEffect(() => {
    if (search.trim().length > 0) {
      setIsSearching(true);
      const timeout = setTimeout(() => {
        fetch(`/api/users/search?q=${encodeURIComponent(search)}&excludeId=${currentUser?.id}`)
          .then(res => res.json())
          .then(setSearchResults);
      }, 300);
      return () => clearTimeout(timeout);
    } else {
      setIsSearching(false);
      setSearchResults([]);
    }
  }, [search, currentUser?.id]);

  const sendRequest = async (user: User) => {
    await fetch('/api/contacts/requests', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ senderId: currentUser?.id, receiverId: user.id })
    });
    fetchRequests();
  };

  const acceptRequest = async (reqId: string) => {
    await fetch(`/api/contacts/requests/${reqId}/accept`, { method: 'POST' });
    fetchRequests();
  };

  const startChat = async (user: User) => {
    const res = await fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser?.id, targetUserId: user.id }),
    });
    if (res.ok) {
      const chat = await res.json();
      addUserToCache(user);
      onNewChat(chat);
      setSearch('');
    }
  };

  return (
    <div className="h-full flex flex-col relative text-white" ref={containerRef}>
      <div className="p-4 bg-transparent sticky top-0 z-20">
         <div className="flex items-center justify-between mb-4">
             <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
         </div>
         <div className="flex space-x-1 bg-white/10 p-1 rounded-xl mb-4">
             <button onClick={() => setActiveTab('chats')} className={cn("flex-1 text-sm font-medium py-1.5 rounded-lg transition-colors", activeTab === 'chats' ? "bg-white/20 text-white" : "text-white/60 hover:text-white")}>Chats</button>
             <button onClick={() => setActiveTab('contacts')} className={cn("flex-1 text-sm font-medium py-1.5 rounded-lg transition-colors", activeTab === 'contacts' ? "bg-white/20 text-white" : "text-white/60 hover:text-white")}>
                 Contacts
                 {requests.incoming.length > 0 && <span className="ml-2 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{requests.incoming.length}</span>}
             </button>
         </div>
         <div className="relative">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60" />
             <input 
                type="text"
                placeholder="Search username..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-10 py-2 bg-black/10 border border-white/20 rounded-xl text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/40 text-sm transition-all"
             />
             {search && (
                 <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 bg-black/20 hover:bg-black/30 text-white/60">
                     <X className="w-3 h-3 text-white" />
                 </button>
             )}
         </div>
      </div>

      <div className="flex-1 overflow-y-auto relative px-3 z-10 flex flex-col space-y-1">
        {isSearching ? (
          <div className="flex flex-col z-10 p-2">
            <h3 className="px-4 py-2 text-xs font-semibold text-white/50 uppercase tracking-wide">Global Search</h3>
            {searchResults.length === 0 ? (
                <div className="p-8 text-center text-white/60">No users found or loading...</div>
            ) : (
                searchResults.map(user => {
                    const isContact = currentUser?.contacts?.includes(user.id);
                    const outgoingReq = requests.outgoing.find(r => r.receiverId === user.id);
                    const incomingReq = requests.incoming.find(r => r.senderId === user.id);

                    return (
                    <div 
                        key={user.id} 
                        className="w-full text-left p-3 flex items-center gap-4 hover:bg-white/10 rounded-2xl transition-colors"
                    >
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-400 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                            {user.username.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-semibold text-white">@{user.username}</p>
                            <p className="text-xs text-white/60">{isContact ? 'Contact' : 'New User'}</p>
                        </div>
                        <div>
                            {isContact ? (
                                <button onClick={() => startChat(user)} className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 rounded-lg text-xs font-semibold">Message</button>
                            ) : outgoingReq ? (
                                <button disabled className="px-3 py-1.5 flex items-center gap-1 bg-white/10 rounded-lg text-xs font-semibold text-white/60 cursor-not-allowed"><Clock className="w-3 h-3"/> Sent</button>
                            ) : incomingReq ? (
                                <button onClick={() => acceptRequest(incomingReq.id)} className="px-3 py-1.5 flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-xs font-semibold"><Check className="w-3 h-3"/> Accept</button>
                            ) : (
                                <button onClick={() => sendRequest(user)} className="px-3 py-1.5 flex items-center gap-1 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-semibold"><UserPlus className="w-3 h-3"/> Add</button>
                            )}
                        </div>
                    </div>
                )})
            )}
          </div>
        ) : activeTab === 'chats' ? (
          <div className="p-1 space-y-1 pb-4">
            {chats.map(chat => {
               const otherId = chat.participants.find(p => p !== currentUser?.id);
               const otherUser = otherId ? usersCache[otherId] : null;

               return (
                   <NavLink 
                     key={chat.id} 
                     to={`/chat/${chat.id}`}
                     className={({ isActive }) => cn(
                       "flex items-center p-3 rounded-2xl transition-colors cursor-pointer",
                       isActive ? "bg-white/20" : "hover:bg-white/10"
                     )}
                   >
                     {({ isActive }) => (
                       <div className="flex w-full items-center">
                         <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center font-bold text-lg flex-shrink-0 mr-4">
                             {otherUser ? otherUser.username.charAt(0).toUpperCase() : '?'}
                         </div>
                         <div className="flex-1 min-w-0">
                           <div className="flex justify-between items-baseline mb-0.5">
                             <p className="font-semibold truncate text-white">
                                 @{otherUser?.username || 'Unknown User'}
                             </p>
                             <p className="text-xs whitespace-nowrap ml-2 text-white/40">
                               {formatDistanceToNow(chat.updatedAt, { addSuffix: false }).replace('about ','')}
                             </p>
                           </div>
                           <p className="text-sm truncate text-white/70">
                               {chat.lastMessage || 'New connection'}
                           </p>
                         </div>
                       </div>
                     )}
                   </NavLink>
               );
            })}
            
            {chats.length === 0 && (
                <div className="p-8 text-center text-white/50">
                    <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
                       <Edit className="w-6 h-6 text-white/50" />
                    </div>
                    <p>No chats yet</p>
                    <p className="text-sm py-2">Search for a username above to start messaging.</p>
                </div>
            )}
          </div>
        ) : (
          <div className="p-1 space-y-1 pb-4">
             {requests.incoming.length > 0 && (
                <div className="mb-4">
                   <h3 className="px-3 py-2 text-xs font-semibold text-white/50 uppercase tracking-wide">Pending Requests</h3>
                   {requests.incoming.map(req => {
                       const sender = usersCache[req.senderId];
                       if (!sender) return null;
                       return (
                           <div key={req.id} className="flex flex-col p-3 bg-white/10 rounded-2xl mb-2">
                               <div className="flex items-center gap-3">
                                   <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center font-bold">{sender.username.charAt(0).toUpperCase()}</div>
                                   <div className="flex-1"><p className="font-semibold text-white">@{sender.username}</p></div>
                                   <button onClick={() => acceptRequest(req.id)} className="p-2 bg-emerald-500 rounded-lg"><Check className="w-4 h-4"/></button>
                               </div>
                           </div>
                       );
                   })}
                </div>
             )}

             <h3 className="px-3 py-2 text-xs font-semibold text-white/50 uppercase tracking-wide">My Contacts</h3>
             {(currentUser?.contacts || []).map(contactId => {
                 const contact = usersCache[contactId];
                 if (!contact) {
                    // Fetch if not cached
                    fetch(`/api/users/${contactId}`).then(r=>r.json()).then(u=>addUserToCache(u));
                    return null;
                 }
                 return (
                    <button key={contact.id} onClick={() => startChat(contact)} className="w-full flex items-center p-3 hover:bg-white/10 rounded-2xl transition-colors">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-400 flex items-center justify-center font-bold text-lg flex-shrink-0 mr-4">
                            {contact.username.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                            <p className="font-semibold truncate text-white">@{contact.username}</p>
                            <p className="text-sm truncate text-white/60">Tap to message</p>
                        </div>
                    </button>
                 );
             })}

             {(!currentUser?.contacts || currentUser.contacts.length === 0) && (
                 <div className="p-8 text-center text-white/50">
                     <p>No contacts yet</p>
                     <p className="text-sm py-2">Search to find people!</p>
                 </div>
             )}
          </div>
        )}
      </div>

      <div className="p-4 bg-white/5 border-t border-white/10 flex justify-between items-center z-20 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full border border-white/30 bg-white/10 flex items-center justify-center font-bold uppercase text-xs">
            {currentUser?.username.charAt(0)}
          </div>
          <div className="flex-1">
            <p className="text-xs text-white/40 leading-tight">Signed in as</p>
            <p className="text-sm font-bold leading-none mt-1">@{currentUser?.username}</p>
          </div>
        </div>
        <button 
          onClick={() => useAppStore.getState().setCurrentUser(null)}
          className="text-xs px-2 py-1 hover:bg-white/10 text-white/50 hover:text-white rounded-md transition-colors"
        >
          Logout
        </button>
      </div>
    </div>
  );
}
