import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { identityApi } from '../api/domains/identity.api';
import { trustApi } from '../api/domains/trust.api';
import { useAuthStore } from '../store/authStore';
import { useModeStore } from '../store/modeStore';
import { fileToBase64 } from '../lib/imageFile';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { friendlyError } from '../lib/errors';
import { StatusBanner } from '../components/StatusBanner';

interface Status { identityVerified: boolean; licenseStatus: string; licenseExpiresAt: string | null; drivingRiskTier: string | null; reverificationDue: boolean | null }
interface Session { id: string; status: string; rejectionReason?: string | null }

/** "Get verified": three short steps that unlock cars. Each step says why it exists and what happens next. */
export function VerifyPage() {
  useDocumentTitle('Get verified');
  const { userId, accessToken: token } = useAuthStore();
  const hostMode = useModeStore((s) => s.mode) === 'host';
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['id-status', userId], enabled: !!userId, queryFn: () => identityApi.getConsolidatedStatus(userId!, token) as Promise<Status> });
  const score = useQuery({ queryKey: ['trust-score', userId], enabled: !!userId, retry: 0,
    queryFn: () => trustApi.getScore(userId!, token) as Promise<{ overallScore: number; tier: string }> });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['id-status'] }); qc.invalidateQueries({ queryKey: ['trust-score'] }); };

  if (!userId) return <Navigate to="/login?next=/verify" replace />;
  if (status.isLoading) return <div className="wrap"><div className="skel" style={{ marginTop: 24 }} aria-busy="true" /></div>;
  if (status.isError)
    return <div className="wrap" style={{ paddingTop: 24 }}><StatusBanner kind="error" message={friendlyError(status.error, 'your verification status')} /><button className="link" onClick={() => status.refetch()}>Try again</button></div>;
  const s = status.data!;
  const licenseOk = s.licenseStatus === 'valid' && !s.reverificationDue;
  const done = Number(s.identityVerified) + Number(licenseOk);

  return (
    <main className="wrap" style={{ maxWidth: 640, paddingTop: 28 }}>
      <h1 style={{ fontSize: 30 }}>Get verified</h1>
      <p>Hosts want to know who is driving their car. Finish the two required steps once and more cars open up to you.</p>
      <div className="note" role="status"><b>{done} of 2 required steps done.</b> {score.data && <>Your level: <b>{score.data.tier}</b> (score {Math.round(score.data.overallScore)}).</>}
        {score.isError && ' We will score your account after your first step.'}</div>
      <Step n={1} title="Confirm your identity" ok={s.identityVerified} why="A photo of your ID and a quick selfie so we know you are you.">
        <IdForm token={token} onDone={refresh} /></Step>
      <Step n={2} title="Add your driving licence" ok={licenseOk} why="We check that your licence is valid and not expired."
        note={s.reverificationDue ? 'Your licence has expired. Add the new one.' : s.licenseStatus === 'pending' ? 'We are checking it now.' : s.licenseStatus === 'invalid' || s.licenseStatus === 'suspended' ? 'We could not confirm this licence. Check the details and try again.' : undefined}>
        <LicenseForm token={token} onDone={refresh} /></Step>
      <Step n={3} title="Share your driving record (optional)" ok={!!s.drivingRiskTier} why="A clean record can raise your level and open more cars. You choose whether to share it.">
        <HistoryForm token={token} onDone={refresh} /></Step>
      <p><Link to={hostMode ? '/owner' : '/'}>{hostMode ? 'Back to my cars' : 'Back to cars'}</Link></p>
    </main>
  );
}

function Step({ n, title, ok, why, note, children }: { n: number; title: string; ok: boolean; why: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="sec" style={{ marginTop: 14 }}>
      <h2 style={{ fontSize: 18 }}>{ok ? '✓' : n}. {title}</h2>
      <p style={{ margin: '4px 0 8px' }}>{why}</p>
      {ok ? <p className="note ok" style={{ margin: 0 }}>Done.</p> : <>{note && <p className="note warn">{note}</p>}{children}</>}
    </section>
  );
}

function IdForm({ token, onDone }: { token: string | null; onDone: () => void }) {
  const [type, setType] = useState('drivers_license');
  const [doc, setDoc] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [step, setStep] = useState('');
  const run = useMutation({
    mutationFn: async () => {
      setStep('Starting…');
      const v = (await identityApi.initiateVerification(type, token)) as Session;
      setStep('Uploading your ID…');
      await identityApi.uploadDocument(v.id, (await fileToBase64(doc!)).base64, token);
      setStep('Checking your selfie…');
      return (await identityApi.submitLiveness(v.id, (await fileToBase64(selfie!)).base64, token)) as Session;
    },
    onSuccess: (r) => { if (r.status === 'approved') onDone(); },
  });
  const r = run.data;
  return (
    <form onSubmit={(e: FormEvent) => { e.preventDefault(); run.mutate(); }} style={{ display: 'grid', gap: 10 }}>
      <label>ID type<select className="field" value={type} onChange={(e) => setType(e.target.value)}>
        <option value="drivers_license">Driver's licence</option><option value="passport">Passport</option><option value="national_id">National ID</option></select></label>
      <label>Photo of your ID<input className="field" type="file" accept="image/*" onChange={(e) => setDoc(e.target.files?.[0] ?? null)} /></label>
      <label>Selfie<input className="field" type="file" accept="image/*" capture="user" onChange={(e) => setSelfie(e.target.files?.[0] ?? null)} /></label>
      {r && r.status !== 'approved' && <p className="note warn" role="alert">We couldn't confirm your identity{r.rejectionReason ? `: ${r.rejectionReason.toLowerCase()}` : ''}. Use good light, keep your face and the whole ID in frame, and try again.</p>}
      {run.isError && <p className="note warn" role="alert">{friendlyError(run.error, 'your ID check')} Your photos were not saved.</p>}
      <button className="btn" disabled={!doc || !selfie || run.isPending}>{run.isPending ? step : 'Verify me'}</button>
      {(!doc || !selfie) && <small>Choose both photos to continue.</small>}
    </form>
  );
}

function LicenseForm({ token, onDone }: { token: string | null; onDone: () => void }) {
  const [f, setF] = useState({ licenseNumber: '', issuingRegion: '', licenseClass: 'C', expirationDate: '' });
  const [msg, setMsg] = useState('');
  const run = useMutation({ mutationFn: () => identityApi.submitLicense(f, token), onSuccess: onDone });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); if (!f.licenseNumber || !f.issuingRegion) return setMsg('Fill in the licence number and where it was issued.');
      if (!f.expirationDate || new Date(f.expirationDate) < new Date()) return setMsg('Enter an expiry date that is in the future.'); setMsg(''); run.mutate(); }} style={{ display: 'grid', gap: 10 }}>
      <label>Licence number<input className="field" value={f.licenseNumber} onChange={set('licenseNumber')} autoComplete="off" /></label>
      <label>Issued in (state or region)<input className="field" value={f.issuingRegion} onChange={set('issuingRegion')} /></label>
      <label>Licence class<input className="field" value={f.licenseClass} onChange={set('licenseClass')} /></label>
      <label>Expiry date<input className="field" type="date" value={f.expirationDate} onChange={set('expirationDate')} /></label>
      {(msg || run.isError) && <p className="note warn" role="alert">{msg || `${friendlyError(run.error, 'your licence')} Check the details and try again.`}</p>}
      <button className="btn" disabled={run.isPending}>{run.isPending ? 'Checking…' : 'Check my licence'}</button>
    </form>
  );
}

function HistoryForm({ token, onDone }: { token: string | null; onDone: () => void }) {
  const [ok, setOk] = useState(false);
  const run = useMutation({ mutationFn: () => identityApi.requestDrivingHistory(true, token), onSuccess: onDone });
  return (
    <form onSubmit={(e) => { e.preventDefault(); run.mutate(); }} style={{ display: 'grid', gap: 10 }}>
      <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
        <span>I agree to DriveShare requesting my driving record to set my trust level.</span></label>
      {run.isSuccess && <p className="note ok" role="status">Requested. Your level updates when the report arrives.</p>}
      {run.isError && <p className="note warn" role="alert">{friendlyError(run.error, 'your driving record')} Nothing was requested.</p>}
      <button className="btn" disabled={!ok || run.isPending}>{run.isPending ? 'Requesting…' : 'Request my record'}</button>
    </form>
  );
}
