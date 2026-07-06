import React, { createContext, useContext, useEffect, useState } from 'react';
import supabase from '../lib/supabase';
import { destroyDevice } from '../services/twilioCallService';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [caller, setCaller] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  async function fetchCaller(userId) {
    if (!userId) { setCaller(null); return; }
    const { data, error } = await supabase
      .from('callers')
      .select('*')
      .eq('id', userId)
      .single();
    if (!error && data) {
      // Only update caller if the ID actually changed — prevents re-renders from
      // token refreshes that return a new object with identical data
      setCaller(prev => {
        if (prev?.id === data.id && prev?.updated_at === data.updated_at) return prev;
        return data;
      });
    }
  }

  useEffect(() => {
    // Restore session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      fetchCaller(u?.id).finally(() => setIsLoading(false));
    });

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      fetchCaller(u?.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  async function signOut() {
    destroyDevice(); // release Twilio browser connection before clearing auth
    await supabase.auth.signOut();
    setUser(null);
    setCaller(null);
  }

  async function updateCaller(updates) {
    if (!user) return;
    const { data, error } = await supabase
      .from('callers')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single();
    if (!error && data) setCaller(data);
    return { error };
  }

  // Admin is now driven by the server-side role on the caller record
  // (callers.role = 'admin'), not a hardcoded email list.
  const isAdmin = caller?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, caller, isAdmin, isLoading, signIn, signOut, updateCaller }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export default AuthContext;
