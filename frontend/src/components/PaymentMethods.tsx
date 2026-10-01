import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { paymentsApi } from '../api/domains/payments.api';
import { useAuthStore } from '../store/authStore';
import { friendlyError } from '../lib/errors';

interface Method { id: string; type: string; brand?: string | null; last4?: string | null }

/** Saved payment methods: choose one, add one, remove one. Every failure says what to do next. */
export function PaymentMethods({ selected, onSelect }: { selected: string | null; onSelect: (id: string) => void }) {
  const { userId, accessToken } = useAuthStore();
  const qc = useQueryClient();
  const key = ['payment-methods', userId];
  const list = useQuery({ queryKey: key, queryFn: () => paymentsApi.listPaymentMethods(userId!, accessToken) as Promise<Method[]>, enabled: !!userId });
  const add = useMutation({
    mutationFn: (d: Record<string, unknown>) => paymentsApi.addPaymentMethod('card', d, accessToken),
    onSuccess: (m) => { qc.invalidateQueries({ queryKey: key }); onSelect((m as Method).id); setAdding(false); },
  });
  const del = useMutation({ mutationFn: (id: string) => paymentsApi.removePaymentMethod(id, accessToken), onSuccess: () => qc.invalidateQueries({ queryKey: key }) });
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ number: '', exp: '', cvc: '' });
  const [msg, setMsg] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    const num = f.number.replace(/\s/g, '');
    if (!/^\d{13,19}$/.test(num)) return setMsg('Enter the card number without letters (13 to 19 digits).');
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(f.exp)) return setMsg('Enter the expiry as MM/YY, for example 08/28.');
    if (!/^\d{3,4}$/.test(f.cvc)) return setMsg('The security code is 3 or 4 digits.');
    setMsg('');
    // Production: replace with the payment processor's hosted fields so card numbers never touch our servers.
    add.mutate({ number: num, expMonth: f.exp.slice(0, 2), expYear: f.exp.slice(3), cvc: f.cvc });
  }

  if (list.isLoading) return <div className="skel" style={{ height: 90 }} aria-busy="true" />;
  if (list.isError) return <p className="note warn" role="alert">{friendlyError(list.error, 'your saved cards')} <button className="link" onClick={() => list.refetch()}>Try again</button></p>;
  const methods = list.data ?? [];
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {methods.length === 0 && !adding && <p className="note">You have no saved card yet. Add one to continue. It is not charged now.</p>}
      <div role="radiogroup" aria-label="Payment method" style={{ display: 'grid', gap: 8 }}>
        {methods.map((m) => (
          <div key={m.id} style={{ display: 'flex', gap: 8 }}>
            <button role="radio" aria-checked={selected === m.id} className="tier" style={{ flex: 1 }} onClick={() => onSelect(m.id)}>
              <b>{m.brand ?? 'Card'} ending {m.last4 ?? '••••'}</b>
            </button>
            <button className="link" aria-label={`Remove card ending ${m.last4}`} disabled={del.isPending} onClick={() => del.mutate(m.id)}>Remove</button>
          </div>
        ))}
      </div>
      {del.isError && <p className="note warn" role="alert">{friendlyError(del.error, 'that card')} It was not removed.</p>}
      {adding ? (
        <form onSubmit={submit} noValidate style={{ display: 'grid', gap: 8 }}>
          <label>Card number<input className="field" inputMode="numeric" autoComplete="cc-number" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} /></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label>Expiry<input className="field" placeholder="MM/YY" autoComplete="cc-exp" value={f.exp} onChange={(e) => setF({ ...f, exp: e.target.value })} /></label>
            <label>Security code<input className="field" inputMode="numeric" autoComplete="cc-csc" value={f.cvc} onChange={(e) => setF({ ...f, cvc: e.target.value })} /></label>
          </div>
          {(msg || add.isError) && <p className="note warn" role="alert" style={{ margin: 0 }}>{msg || `${friendlyError(add.error, 'that card')} Check the details and try again.`}</p>}
          <button className="btn" disabled={add.isPending}>{add.isPending ? 'Saving…' : 'Save card'}</button>
          <button type="button" className="link" onClick={() => setAdding(false)}>Cancel</button>
        </form>
      ) : <button className="link" style={{ justifySelf: 'start' }} onClick={() => setAdding(true)}>+ Add a card</button>}
    </div>
  );
}
