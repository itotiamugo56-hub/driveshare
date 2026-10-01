import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useTestRunStore, LogEntry } from '../store/testRunStore';
import { DOMAIN_RUNNERS, runFullSuite, runSingleDomain, resetContext, getContext } from './orchestrator';

function levelColor(level: LogEntry['level']) {
  switch (level) {
    case 'pass':
      return '#16a34a';
    case 'fail':
      return '#dc2626';
    case 'skip':
      return '#ca8a04';
    default:
      return '#64748b';
  }
}

function levelBadge(level: LogEntry['level']) {
  switch (level) {
    case 'pass':
      return 'PASS';
    case 'fail':
      return 'FAIL';
    case 'skip':
      return 'SKIP';
    default:
      return 'INFO';
  }
}

export function TestDashboardPage() {
  const { baseUrl, setBaseUrl } = useAuthStore();
  const { entries, passCount, failCount, skipCount, running } = useTestRunStore();
  const [adminEmail, setAdminEmail] = useState('admin@driveshare.dev');
  const [adminPassword, setAdminPassword] = useState('Password123!');

  const ctx = getContext();
  ctx.adminEmail = adminEmail;
  ctx.adminPassword = adminPassword;

  return (
    <div style={{ fontFamily: 'ui-sans-serif, system-ui', maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>DriveShare — Test Runner Dashboard</h1>
      <p style={{ color: '#64748b', marginTop: 0, marginBottom: 20 }}>
        Exercises every backend capability via this frontend's own API client layer (
        <code>src/api/client.ts</code>), mirroring <code>scripts/smoke-test.ps1</code> section-by-section — happy
        paths and documented failure paths alike. Dev-only screen; not part of the customer-facing app.
      </p>

      <section style={panelStyle}>
        <h2 style={h2Style}>Configuration</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Field label="Base URL">
            <input style={inputStyle} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          </Field>
          <Field label="Seeded admin email">
            <input style={inputStyle} value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
          </Field>
          <Field label="Seeded admin password">
            <input style={inputStyle} type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} />
          </Field>
        </div>
        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
          Owner/renter/delete-me/fraudster/support/arbitrator/service accounts are all generated fresh on every run
          (matching <code>New-TestEmail</code> in the script) — nothing else needs manual entry. The service-role
          token is minted mid-run via <code>POST /admin/staff/accounts</code>, exactly as the script does.
        </p>
      </section>

      <section style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={h2Style}>Run</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={primaryBtn} disabled={running} onClick={() => runFullSuite()}>
              {running ? 'Running…' : 'Run Full Suite'}
            </button>
            <button style={secondaryBtn} disabled={running} onClick={() => resetContext()}>
              Reset
            </button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, marginTop: 12 }}>
          {DOMAIN_RUNNERS.map((r) => (
            <button key={r.key} style={domainBtn} disabled={running} onClick={() => runSingleDomain(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
      </section>

      <section style={panelStyle}>
        <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
          <Counter label="Pass" value={passCount} color="#16a34a" />
          <Counter label="Fail" value={failCount} color="#dc2626" />
          <Counter label="Skip" value={skipCount} color="#ca8a04" />
          <Counter label="Total" value={entries.filter((e) => e.level !== 'info').length} color="#334155" />
        </div>
        <div style={{ maxHeight: 480, overflowY: 'auto', background: '#0f172a', borderRadius: 8, padding: 12 }}>
          {entries.length === 0 && <div style={{ color: '#64748b', fontFamily: 'monospace' }}>No results yet — run a section above.</div>}
          {entries.map((e) => (
            <div key={e.id} style={{ fontFamily: 'monospace', fontSize: 12.5, marginBottom: 4, color: '#e2e8f0' }}>
              <span style={{ color: '#64748b' }}>[{e.domain}]</span>{' '}
              <span style={{ color: levelColor(e.level), fontWeight: 700 }}>{levelBadge(e.level)}</span>{' '}
              <span>{e.message}</span>
              {e.details && <div style={{ color: '#94a3b8', marginLeft: 16 }}>{e.details}</div>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: '#334155' }}>
      {label}
      {children}
    </label>
  );
}

function Counter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: '#64748b' }}>{label}</div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: 16,
  marginBottom: 16,
};
const h2Style: React.CSSProperties = { fontSize: 15, margin: '0 0 12px 0' };
const inputStyle: React.CSSProperties = { padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1' };
const primaryBtn: React.CSSProperties = {
  background: '#111827',
  color: 'white',
  border: 'none',
  borderRadius: 6,
  padding: '8px 14px',
  cursor: 'pointer',
  fontWeight: 600,
};
const secondaryBtn: React.CSSProperties = {
  background: 'white',
  color: '#111827',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  padding: '8px 14px',
  cursor: 'pointer',
};
const domainBtn: React.CSSProperties = {
  background: '#f8fafc',
  color: '#111827',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  padding: '8px 10px',
  cursor: 'pointer',
  fontSize: 13,
  textAlign: 'left',
};
