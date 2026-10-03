import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { createClient } from '@supabase/supabase-js';

const env = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env;
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const cloudConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId &&
  env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLISHABLE_KEY
);

const firebaseApp = cloudConfigured ? getApps()[0] ?? initializeApp(firebaseConfig) : null;
if (firebaseApp && env.VITE_FIREBASE_APPCHECK_SITE_KEY) {
  initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaV3Provider(env.VITE_FIREBASE_APPCHECK_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}

export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;
export const cloudFunctions = firebaseApp ? getFunctions(firebaseApp, env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1') : null;
export const supabase = cloudConfigured
  ? createClient(env.VITE_SUPABASE_URL!, env.VITE_SUPABASE_PUBLISHABLE_KEY!, {
      accessToken: async () => firebaseAuth?.currentUser?.getIdToken() ?? null,
    })
  : null;

export async function provisionAccount() {
  if (!cloudFunctions || !firebaseAuth?.currentUser) throw new Error('Please sign in first.');
  await httpsCallable(cloudFunctions, 'ensureWorkspaceAccount')();
  await firebaseAuth.currentUser.getIdToken(true);
}

export async function requestPel(prompt: string, context: string) {
  if (!cloudFunctions) throw new Error('Connect Firebase to use live AI.');
  const result = await httpsCallable<{ prompt: string; context: string }, { text: string }>(cloudFunctions, 'askPel')({ prompt, context });
  return result.data.text;
}

export function friendlyError(error: unknown) {
  const err = error as { code?: string; message?: string };
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'The email or password is incorrect. Please try again.',
    'auth/email-already-in-use': 'An account already exists with this email. Sign in instead.',
    'auth/weak-password': 'Choose a password with at least 8 characters.',
    'auth/popup-closed-by-user': 'The sign-in window was closed. You can try again.',
    'auth/popup-blocked': 'Allow popups for this site, then try Google sign-in again.',
    'auth/unauthorized-domain': 'This domain needs to be added in Firebase Authentication settings.',
    'auth/network-request-failed': 'You appear to be offline. Check your connection and try again.',
    'auth/too-many-requests': 'Too many attempts. Please wait a little before trying again.',
    'functions/not-found': 'Deploy the Firebase workspace functions to finish connecting your account.',
    'functions/unauthenticated': 'This session could not be verified. Sign in again; if this continues, check Firebase App Check setup.',
    'functions/failed-precondition': 'Verify your email and configure the required cloud service first.',
    '42501': 'Access denied. Check the Firebase role claim and Supabase row-level policies.',
    '42P01': 'The workspace tables are not installed yet. Run the Supabase migration.',
  };
  if (err?.code?.startsWith('functions/') && err.message && !['internal', 'unauthenticated', 'not-found'].includes(err.message.toLowerCase())) return err.message;
  return messages[err?.code || ''] || err?.message || 'Something did not finish. Please try again.';
}