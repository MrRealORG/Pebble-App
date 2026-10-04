import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  browserLocalPersistence, browserSessionPersistence, createUserWithEmailAndPassword,
  GoogleAuthProvider, onIdTokenChanged, sendEmailVerification, sendPasswordResetEmail,
  setPersistence, signInWithEmailAndPassword, signInWithPopup, signOut as fbSignOut, updateProfile,
} from 'firebase/auth';
import { cloudConfigured, firebaseAuth, hasFirebase, provisionAccount, supabase } from './cloud';

export type AuthUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
};

type AccountContext = {
  user: AuthUser | null;
  ready: boolean;
  admin: boolean;
  preview: boolean;
  login: (email: string, password: string, remember: boolean) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  google: () => Promise<void>;
  reset: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  enterPreview: () => void;
  leavePreview: () => void;
};

const Context = createContext<AccountContext | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(!cloudConfigured);
  const [admin, setAdmin] = useState(false);
  const [preview, setPreview] = useState(() => !cloudConfigured && sessionStorage.getItem('pebblex-preview-closed') !== '1');

  useEffect(() => {
    let mounted = true;

    if (supabase) {
      // Supabase Auth session listener
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!mounted) return;
        if (session?.user) {
          const u: AuthUser = {
            uid: session.user.id,
            email: session.user.email ?? null,
            displayName: (session.user.user_metadata?.name || session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Friend') as string,
          };
          setUser(u);
          const isAdmin = session.user.email === 'realmrhacker26@gmail.com' ||
                          (session.user.app_metadata as Record<string, unknown> | undefined)?.claims_admin === true ||
                          (session.user.app_metadata as Record<string, unknown> | undefined)?.role === 'admin' ||
                          (session.user.user_metadata as Record<string, unknown> | undefined)?.role === 'admin';
          setAdmin(!!isAdmin);
        } else {
          setUser(null);
          setAdmin(false);
        }
        setReady(true);
      }).catch(() => {
        if (mounted) setReady(true);
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!mounted) return;
        if (session?.user) {
          const u: AuthUser = {
            uid: session.user.id,
            email: session.user.email ?? null,
            displayName: (session.user.user_metadata?.name || session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Friend') as string,
          };
          setUser(u);
          const isAdmin = session.user.email === 'realmrhacker26@gmail.com' ||
                          (session.user.app_metadata as Record<string, unknown> | undefined)?.claims_admin === true ||
                          (session.user.app_metadata as Record<string, unknown> | undefined)?.role === 'admin' ||
                          (session.user.user_metadata as Record<string, unknown> | undefined)?.role === 'admin';
          setAdmin(!!isAdmin);
        } else {
          setUser(null);
          setAdmin(false);
        }
        setReady(true);
      });

      return () => {
        mounted = false;
        subscription.unsubscribe();
      };
    } else if (hasFirebase && firebaseAuth) {
      let generation = 0;
      const unsubscribe = onIdTokenChanged(firebaseAuth, async (next) => {
        const current = ++generation;
        if (next) {
          setUser({ uid: next.uid, email: next.email, displayName: next.displayName });
        } else {
          setUser(null);
        }
        setAdmin(false);
        try {
          const token = await next?.getIdTokenResult();
          if (current === generation) setAdmin(token?.claims.admin === true);
        } catch {
          if (current === generation) setAdmin(false);
        } finally {
          if (current === generation) setReady(true);
        }
      });
      return () => { generation++; unsubscribe(); };
    } else {
      setReady(true);
    }
  }, []);

  return <Context.Provider value={{
    user, ready, admin, preview: preview && !user,
    login: async (email, password, remember) => {
      if (supabase) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setPreview(false);
        return;
      }
      if (hasFirebase && firebaseAuth) {
        await setPersistence(firebaseAuth, remember ? browserLocalPersistence : browserSessionPersistence);
        await signInWithEmailAndPassword(firebaseAuth, email, password);
        await provisionAccount();
        setPreview(false);
        return;
      }
      throw new Error('Cloud sign-in is not configured yet. You can explore the local preview without an account.');
    },
    register: async (email, password, name) => {
      if (supabase) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name: name.trim() } }
        });
        if (error) throw error;
        setPreview(false);
        return;
      }
      if (hasFirebase && firebaseAuth) {
        await setPersistence(firebaseAuth, browserLocalPersistence);
        const result = await createUserWithEmailAndPassword(firebaseAuth, email, password);
        await updateProfile(result.user, { displayName: name.trim() });
        await sendEmailVerification(result.user);
        await provisionAccount();
        setPreview(false);
        return;
      }
      throw new Error('Cloud sign-in is not configured yet. You can explore the local preview without an account.');
    },
    google: async () => {
      if (supabase) {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin + '/app' }
        });
        if (error) throw error;
        setPreview(false);
        return;
      }
      if (hasFirebase && firebaseAuth) {
        await setPersistence(firebaseAuth, browserLocalPersistence);
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await signInWithPopup(firebaseAuth, provider);
        await provisionAccount();
        setPreview(false);
        return;
      }
      throw new Error('Cloud sign-in is not configured yet. You can explore the local preview without an account.');
    },
    reset: async (email) => {
      if (supabase) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + '/login'
        });
        if (error) throw error;
        return;
      }
      if (hasFirebase && firebaseAuth) {
        await sendPasswordResetEmail(firebaseAuth, email);
        return;
      }
      throw new Error('Cloud sign-in is not configured yet.');
    },
    logout: async () => {
      const uid = user?.uid;
      const drafts = uid ? Object.keys(sessionStorage).filter((key) => key.startsWith(`pebblex-note-draft:${uid}:`)) : [];
      if (drafts.length && !window.confirm('You have an unsaved note draft. Sign out and discard it? Cancel to save or export the note first.')) {
        throw new Error('Sign-out cancelled. Your unsaved note is still here.');
      }
      if (supabase) await supabase.auth.signOut();
      else if (hasFirebase && firebaseAuth) await fbSignOut(firebaseAuth);
      if (uid) {
        for (const key of Object.keys(sessionStorage)) {
          if (key.startsWith(`pebblex-note-draft:${uid}:`)) sessionStorage.removeItem(key);
        }
      }
      setPreview(false);
      sessionStorage.setItem('pebblex-preview-closed', '1');
    },
    enterPreview: () => { setPreview(true); sessionStorage.removeItem('pebblex-preview-closed'); },
    leavePreview: () => { setPreview(false); sessionStorage.setItem('pebblex-preview-closed', '1'); },
  }}>{children}</Context.Provider>;
}

export function useAccount() {
  const context = useContext(Context);
  if (!context) throw new Error('AccountProvider is required.');
  return context;
}