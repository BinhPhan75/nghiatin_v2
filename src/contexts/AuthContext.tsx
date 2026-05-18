import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';
import { Profile, UserRole } from '../types';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  isAccountant: boolean;
  isSales: boolean;
  isConfigured: boolean;
  isApproved: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const isSupabaseConfigured = Boolean(
    import.meta.env.VITE_SUPABASE_URL && 
    import.meta.env.VITE_SUPABASE_ANON_KEY
  );

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    // Check current session
    const authTimeout = setTimeout(() => {
      console.warn("Auth initialization timed out, forcing loading to false.");
      setLoading(false);
    }, 10000); // 10s fallback

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      clearTimeout(authTimeout);
      if (error) {
        console.error("Auth session error:", error.message);
        setUser(null);
        setLoading(false);
        return;
      }

      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id, session.user.email);
      } else {
        setLoading(false);
      }
    }).catch(err => {
      console.error("Critical getSession error:", err);
      clearTimeout(authTimeout);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`[AuthContext] Auth Event: ${event}`);
      
      if (session?.user) {
        setUser(session.user);
        await fetchProfile(session.user.id, session.user.email);
        // Only update last seen on event change, not periodically
        updateLastSeen(session.user.id);
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const updateLastSeen = async (uid: string) => {
    try {
      await supabase
        .from('profiles')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', uid);
    } catch (err) {
      console.warn("Could not update last_seen_at:", err);
    }
  };

  const fetchProfile = async (uid: string, email?: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .single();

      if (error) throw error;
      setProfile(data as Profile);
    } catch (err) {
      console.error("Profile fetch error, using fallback matching email:", err);
      // Fallback for when profile doesn't exist yet but user is logged in
      const effectiveEmail = email || user?.email || '';
      const isAdminEmail = effectiveEmail.toLowerCase().trim() === 'binhphan.070582@gmail.com';
      setProfile({
        id: uid,
        email: effectiveEmail,
        role: isAdminEmail ? 'ADMIN' : 'SALES',
        status: 'APPROVED',
        created_at: new Date().toISOString(),
      } as Profile);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  const role = profile?.role?.toUpperCase();
  const isAdminEmail = user?.email?.toLowerCase()?.trim() === 'binhphan.070582@gmail.com';
  const calculatedIsAdmin = isAdminEmail || role === 'ADMIN';

  const value = useMemo(() => ({
    user,
    profile,
    loading,
    isAdmin: calculatedIsAdmin,
    isAccountant: role === 'ACCOUNTANT' && !calculatedIsAdmin,
    isSales: (role === 'SALES' || !role) && !calculatedIsAdmin,
    isConfigured: isSupabaseConfigured,
    isApproved: profile?.status === 'APPROVED' || isAdminEmail,
    signOut,
  }), [user, profile, loading, calculatedIsAdmin, role, isAdminEmail, isSupabaseConfigured]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
