import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Briefcase, LogIn, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  const isPlaceholder = import.meta.env.VITE_SUPABASE_URL === 'https://placeholder.supabase.co' || !import.meta.env.VITE_SUPABASE_URL;

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPlaceholder) {
      setError('Hệ thống chưa được cấu hình Supabase! Vui lòng vào Cài đặt và nhập URL & Anon Key.');
      return;
    }
    setLoading(true);
    setError(null);

    // Map 'admin' username to 'binhphan.070582@gmail.com'
    const loginEmail = email.toLowerCase() === 'admin' ? 'binhphan.070582@gmail.com' : email;

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password,
    });

    if (authError) {
      if (authError.message.includes('Invalid login credentials')) {
        setError('Email hoặc mật khẩu không chính xác');
      } else if (authError.message.includes('Email not confirmed')) {
        setError('Tài khoản chưa được xác nhận email. Vui lòng kiểm tra hộp thư hoặc tắt tính năng "Confirm email" trong Supabase.');
      } else {
        setError(`Lỗi: ${authError.message}`);
      }
    } else {
      navigate('/');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-paper rounded-sm p-8 shadow-2xl"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-gold-primary flex items-center justify-center rounded-sm mb-4">
            <Briefcase className="text-ink" size={32} />
          </div>
          <h1 className="text-3xl text-ink">Đăng nhập</h1>
          <p className="text-[10px] uppercase font-black text-neutral-400 tracking-[0.2em] mt-2">Hệ Thống NGHIATIN GOLD</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-sm flex items-center gap-3 mb-6 border border-red-100 italic text-sm">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleAuth} className="flex flex-col gap-4">
          <div className="input-field">
            <label htmlFor="email">Email đăng nhập</label>
            <input 
              id="email"
              name="email"
              type="text" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@gmail.com"
              required
              disabled={loading}
              autoComplete="username"
            />
          </div>

          <div className="input-field">
            <label htmlFor="password">Mật khẩu</label>
            <input 
              id="password"
              name="password"
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={loading}
              autoComplete="current-password"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="mt-4 bg-ink text-paper p-4 font-black uppercase tracking-widest hover:bg-gold-primary hover:text-ink transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? 'Đang xử lý...' : (
              <>
                Vào hệ thống <LogIn size={18} />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-neutral-100 text-center">
          <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">
            &copy; 2026 BINHPHAN. All Rights Reserved.
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
