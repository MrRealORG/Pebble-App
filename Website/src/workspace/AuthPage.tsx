import { useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
import { BrandMark } from '../components/Icon';
import { useAccount } from './AuthContext';
import { cloudConfigured, friendlyError } from './cloud';
import { navigate } from './navigation';
import { AppButton, IconButton } from './ui';

export function AuthPage({ signup = false }: { signup?: boolean }) {
  const account = useAccount();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reset, setReset] = useState(false);
  const [sent, setSent] = useState(false);
  const params = new URLSearchParams(window.location.search);
  const requestedDestination = params.get('next') || '/app';
  const destination = /^\/(app|admin)(\/|\?|$)/.test(requestedDestination) ? requestedDestination : '/app';

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      if (reset) { await account.reset(email.trim()); setSent(true); }
      else {
        if (signup) await account.register(email.trim(), password, name);
        else await account.login(email.trim(), password, remember);
        navigate(destination);
      }
    } catch (err) { setError(friendlyError(err)); }
    finally { setBusy(false); }
  };

  const google = async () => {
    setBusy(true); setError('');
    try { await account.google(); navigate(destination); }
    catch (err) { setError(friendlyError(err)); }
    finally { setBusy(false); }
  };

  return <div className="ws-auth">
    <div className="ws-auth-visual">
      <img src="/images/workspace-landscape.jpg" alt="Quiet green hills in the morning light" />
      <a className="ws-auth-brand" href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }}><BrandMark size={37} />PebbleX</a>
      <div className="ws-auth-statement"><small>A little space for your best work</small><h2>One calm workspace.<br />Everywhere you go.</h2><p>Your thoughts, your tasks, your little moments of clarity. All in a place that feels like you.</p></div>
      <div className="ws-auth-visual-footer"><span>Thoughtfully made for your everyday.</span><span>PebbleX / 0.1</span></div>
    </div>
    <div className="ws-auth-form-plane">
      <div><a href="/" className="ws-auth-back" onClick={(e) => { e.preventDefault(); navigate('/'); }}><ArrowLeft size={14} />Back to PebbleX</a></div>
      <div className="ws-auth-form" key={`${signup}-${reset}`}>
        <div className="ws-eyebrow">YOUR WORK, WITHOUT THE NOISE</div>
        <h1>{reset ? 'A fresh start.' : signup ? 'Make room for you.' : 'Welcome back.'}</h1>
        <p>{reset ? 'We will send you a secure link to reset your password.' : signup ? 'Create your account. Your workspace is waiting.' : 'A familiar space, wherever you left off.'}</p>
        {!reset && <><AppButton variant="outline" className="ws-auth-google" onClick={() => { void google(); }} disabled={busy}><svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.61 4.61 0 0 1-2 3.03v2.52h3.24c1.9-1.75 2.98-4.33 2.98-7.38Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.39l-3.24-2.52c-.9.6-2.06.96-3.38.96-2.61 0-4.83-1.76-5.62-4.12H3.03v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.38 13.93a6 6 0 0 1 0-3.86V7.48H3.03a10 10 0 0 0 0 9.04l3.35-2.59Z"/><path fill="#EA4335" d="M12 5.95c1.47 0 2.79.5 3.82 1.5l2.86-2.86A9.61 9.61 0 0 0 12 2a10 10 0 0 0-8.97 5.48l3.35 2.59A5.99 5.99 0 0 1 12 5.95Z"/></svg>Continue with Google</AppButton><div className="ws-auth-divider">or continue with email</div></>}
        {sent ? <div className="ws-form-success" role="status"><ShieldCheck size={22} style={{ marginBottom: 10 }} /><strong>Check your inbox.</strong><p>If an account exists for {email}, a password-reset link will be sent to it.</p><button className="ws-text-button" onClick={() => { setReset(false); setSent(false); }}>Back to sign in <ArrowRight size={13} /></button></div> : <form onSubmit={(e) => { void submit(e); }}>
          {signup && !reset && <label className="ws-field">Your name<input className="ws-input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Morgan" required maxLength={80} /></label>}
          <label className="ws-field">Email address<input className="ws-input" autoComplete="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required /></label>
          {!reset && <label className="ws-field">Password<div className="ws-password-input"><input className="ws-input" autoComplete={signup ? 'new-password' : 'current-password'} type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={signup ? 'At least 8 characters' : 'Enter your password'} required minLength={signup ? 8 : 1} /><IconButton icon={showPassword ? EyeOff : Eye} label={showPassword ? 'Hide password' : 'Show password'} type="button" onClick={() => setShowPassword((v) => !v)} /></div></label>}
          {!reset && !signup && <div className="ws-auth-extras"><label><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />Keep me signed in</label><button type="button" onClick={() => { setReset(true); setError(''); }}>Forgot password?</button></div>}
          {error && <div className="ws-form-error" role="alert">{error}</div>}
          <AppButton type="submit" className="ws-auth-submit" disabled={busy}>{busy ? <LoaderCircle size={16} className="ws-spin" /> : <>{reset ? 'Send reset link' : signup ? 'Create your workspace' : 'Sign in to your workspace'}<ArrowRight size={16} /></>}</AppButton>
        </form>}
        {!reset && <div className="ws-auth-switch">{signup ? 'Already found your space?' : 'New here?'}<button onClick={() => { setError(''); navigate(signup ? '/login' : '/signup'); }}>{signup ? 'Sign in' : 'Create an account'}</button></div>}
        {account.user && <div className="ws-auth-preview"><AppButton variant="soft" icon={ArrowRight} onClick={() => navigate(destination)}>Continue as {account.user.displayName?.split(' ')[0] || 'your account'}</AppButton><p>You already have a Firebase session in this browser.</p></div>}
        {reset && !sent && <button className="ws-text-button" style={{ marginTop: 20 }} onClick={() => { setReset(false); setError(''); }}><ArrowLeft size={13} />Back to sign in</button>}
        {!cloudConfigured && <div className="ws-auth-preview"><AppButton variant="soft" icon={Sparkles} onClick={() => { account.enterPreview(); navigate('/app'); }}>Take a look inside</AppButton><p>Explore the local preview. Cloud sign-in requires setup.</p></div>}
      </div>
      <div className="ws-auth-footer"><LockKeyhole size={12} />Your account. Your workspace. Securely connected.</div>
    </div>
  </div>;
}