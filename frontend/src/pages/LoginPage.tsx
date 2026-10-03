import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi, toSession } from '../api/domains/auth.api';
import { useAppStore } from '../store/appStore';
import { Wordmark } from '../components/Brand';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { errStatus } from '../lib/errors';
import { useAuthStore } from '../store/authStore';

/** One screen for sign in and sign up. Errors appear next to the field that needs fixing. */
export function LoginPage() {
  useDocumentTitle('Sign in');
  const [sp] = useSearchParams();
  const [mode, setMode] = useState<'in' | 'up'>(sp.get('mode') === 'up' ? 'up' : 'in');
  const notice = useAppStore((a) => a.sessionNotice);
  const setNotice = useAppStore((a) => a.setNotice);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ field?: 'email' | 'password'; text: string } | null>(null);
  const setSession = useAuthStore((s) => s.setSession);
  const nav = useNavigate();
  // Only same-site paths are allowed, so a crafted link can't bounce someone to another site after sign-in.
  const rawNext = sp.get('next') ?? '/';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErr({ field: 'email', text: 'Enter an email like name@example.com.' });
    if (password.length < 8) return setErr({ field: 'password', text: 'Use at least 8 characters.' });
    setErr(null);
    setBusy(true);
    try {
      const res = await (mode === 'in' ? authApi.login : authApi.register)(email, password);
      setSession(toSession(res));
      setNotice(null);
      useAppStore.getState().completeOnboarding();
      nav(next, { replace: true });
    } catch (ex) {
      const s = errStatus(ex);
      setErr({
        text:
          s === 401 || s === 400 ? (mode === 'in' ? "That email and password don't match. Check them, or create an account." : 'Those details need a fix. Try a different email or a longer password.')
          : s === 409 ? 'That email already has an account. Sign in instead.'
          : !s ? "We can't reach DriveShare. Check your connection and try again."
          : 'Something went wrong on our side. Try again in a minute.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap" style={{ maxWidth: 440, paddingTop: 40 }}>
      {notice === 'expired' && <div className="note warn" role="status">Your session ended, so please sign in again. We kept your place.</div>}
      <div style={{ marginBottom: 18 }}><Wordmark size={36} /></div>
      <h1 style={{ fontSize: 30 }}>{mode === 'in' ? 'Welcome back' : 'Create your account'}</h1>
      <p>{mode === 'in' ? 'Sign in to see which cars you can book.' : 'It takes a minute. You can browse without one, but you need it to book.'}</p>
      <form onSubmit={submit} noValidate className="sec" style={{ display: 'grid', gap: 12 }}>
        <label>Email
          <input className="field" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
            aria-invalid={err?.field === 'email'} aria-describedby="fe" />
        </label>
        <label>Password
          <span style={{ display: 'flex', gap: 6 }}>
            <input className="field" type={show ? 'text' : 'password'} autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
              value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={err?.field === 'password'} aria-describedby="fe" />
            <button type="button" className="link" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
          </span>
        </label>
        {err && <div id="fe" role="alert" className="note warn" style={{ margin: 0 }}>{err.text}</div>}
        <button className="btn" disabled={busy}>{busy ? 'One moment…' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="link" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setErr(null); }}>
          {mode === 'in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </button>
      </form>
    </main>
  );
}
