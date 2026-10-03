import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  browserLocalPersistence, browserSessionPersistence, createUserWithEmailAndPassword,
  GoogleAuthProvider, onIdTokenChanged, sendEmailVerification, sendPasswordResetEmail,
  setPersistence, signInWithEmailAndPassword, signInWithPopup, signOut, updateProfile,
  type User,
} from 'firebase/auth';
import { cloudConfigured, firebaseAuth, provisionAccount } from './cloud';

type AccountContext = {
  user: User | null;
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
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!cloudConfigured);
  const [admin, setAdmin] = useState(false);
  const [preview, setPreview] = useState(() => !cloudConfigured && sessionStorage.getItem('pebblex-preview-closed') !== '1');

  useEffect(() => {
    if (!firebaseAuth) return;
    let generation = 0;
    const unsubscribe = onIdTokenChanged(firebaseAuth, async (next) => {
      const current = ++generation;
      setUser(next);
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
  }, []);

  const requireAuth = () => {
    if (!firebaseAuth) throw new Error('Cloud sign-in is not configured yet. You can explore the local preview without an account.');
    return firebaseAuth;
  };

  return <Context.Provider value={{
    user, ready, admin, preview: preview && !user,
    login: async (email, password, remember) => {
      const auth = requireAuth();
      await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
      await signInWithEmailAndPassword(auth, email, password);
      await provisionAccount();
      setPreview(false);
    },
    register: async (email, password, name) => {
      const auth = requireAuth();
      await setPersistence(auth, browserLocalPersistence);
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(result.user, { displayName: name.trim() });
      await sendEmailVerification(result.user);
      await provisionAccount();
      setPreview(false);
    },
    google: async () => {
      const auth = requireAuth();
      await setPersistence(auth, browserLocalPersistence);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
      await provisionAccount();
      setPreview(false);
    },
    reset: async (email) => { await sendPasswordResetEmail(requireAuth(), email); },
    logout: async () => {
      const uid = firebaseAuth?.currentUser?.uid;
      const drafts = uid ? Object.keys(sessionStorage).filter((key) => key.startsWith(`pebblex-note-draft:${uid}:`)) : [];
      if (drafts.length && !window.confirm('You have an unsaved note draft. Sign out and discard it? Cancel to save or export the note first.')) {
        throw new Error('Sign-out cancelled. Your unsaved note is still here.');
      }
      if (firebaseAuth) await signOut(firebaseAuth);
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