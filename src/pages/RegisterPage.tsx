import React, { useState } from 'react';
import { useAppStore } from '../store';
import { useNavigate } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setCurrentUser } = useAppStore();
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    setLoading(true);
    setError('');
    
    try {
      // First try to login
      let res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      });
      
      let user;
      if (res.ok) {
         user = await res.json();
      } else {
         // Try to register
         res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username.trim() }),
          });
          if (!res.ok) {
              const data = await res.json();
              throw new Error(data.error || 'Registration failed');
          }
          user = await res.json();
      }

      setCurrentUser(user);
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-tr from-sky-400 via-indigo-400 to-purple-500 p-4 font-sans">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="p-8 text-center border-b border-white/10">
          <div className="w-20 h-20 bg-white/10 border border-white/30 rounded-full flex items-center justify-center mx-auto backdrop-blur-sm mb-4">
            <MessageCircle className="w-10 h-10 text-white/80" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Messages</h1>
          <p className="text-white/60">Connect with anyone, anywhere.</p>
        </div>
        
        <form onSubmit={handleRegister} className="p-8">
          <div className="mb-6">
            <label htmlFor="username" className="block text-sm font-medium text-white/80 mb-2">
              Choose a unique username
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="e.g. john_doe"
              className="w-full px-4 py-3 bg-black/10 border border-white/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-white/40 text-white placeholder-white/40 transition-all"
              required
            />
            <p className="mt-2 text-xs text-white/50">Only lowercase letters, numbers, and underscores.</p>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 text-sm text-red-300 bg-red-400/20 p-2 rounded-xl text-center"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={loading || !username.trim()}
            className="w-full bg-blue-500 hover:bg-blue-400 text-white font-medium py-3 rounded-2xl transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {loading ? 'Continuing...' : 'Continue'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
