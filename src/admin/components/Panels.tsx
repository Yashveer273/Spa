import { useEffect, useState } from 'react';
import { adminApi, ago, when, type AdminEvent, type Customer, type Subscriber } from '../api';

export function CustomersPanel({ refreshKey, onError }: { refreshKey: number; onError: (e: unknown) => void }) {
  const [list, setList] = useState<Customer[] | null>(null);
  useEffect(() => { adminApi.customers().then((r) => setList(r.customers)).catch(onError); }, [refreshKey, onError]);
  return (
    <section className="panel">
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Mobile</th><th>City</th><th>Joined</th><th>Last login</th><th>Bookings</th></tr></thead>
          <tbody>
            {(list || []).map((u) => (
              <tr key={u._id}>
                <td data-label="Name"><b>{u.name}</b></td>
                <td data-label="Email"><a href={`mailto:${u.email}`}>{u.email}</a></td>
                <td data-label="Mobile">{u.mobile ? <a href={`tel:+91${u.mobile}`}>+91 {u.mobile}</a> : '–'}</td>
                <td data-label="City">{u.city || '–'}</td>
                <td data-label="Joined">{when(u.createdAt)}</td>
                <td data-label="Last login">{when(u.lastLoginAt)}</td>
                <td data-label="Bookings"><b>{u.bookings}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
        {list && !list.length && <p className="empty">No customer accounts yet.</p>}
      </div>
    </section>
  );
}

export function SubscribersPanel({ refreshKey, onError, toast }: { refreshKey: number; onError: (e: unknown) => void; toast: (m: string) => void }) {
  const [list, setList] = useState<Subscriber[] | null>(null);
  useEffect(() => { adminApi.subscribers().then((r) => setList(r.subscribers)).catch(onError); }, [refreshKey, onError]);
  const copyAll = async () => {
    const emails = (list || []).map((s) => s.email);
    if (!emails.length) { toast('No emails to copy yet.'); return; }
    try { await navigator.clipboard.writeText(emails.join(', ')); toast(`Copied ${emails.length} emails`); }
    catch { window.prompt('Copy these emails:', emails.join(', ')); }
  };
  const n = list?.length || 0;
  return (
    <section className="panel">
      <div className="toolbar"><span className="muted">{n} subscriber{n === 1 ? '' : 's'}</span><button className="btn" onClick={copyAll}>Copy all emails</button></div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Email</th><th>Subscribed</th></tr></thead>
          <tbody>
            {(list || []).map((s) => (
              <tr key={s.email}><td data-label="Email"><a href={`mailto:${s.email}`}>{s.email}</a></td><td data-label="Subscribed">{when(s.createdAt)}</td></tr>
            ))}
          </tbody>
        </table>
        {list && !list.length && <p className="empty">No newsletter sign-ups yet.</p>}
      </div>
    </section>
  );
}

const ICON: Record<string, string> = { booking_request: '📝', payment_started: '💳', payment_success: '✅', payment_failed: '⚠️', signup: '👤', subscribe: '✉️', status_change: '🔄', catalog_update: '🛠️' };

/** Activity list (used in the side panel and the Activity tab). Re-renders every 30 s to keep "x min ago" fresh. */
export function Feed({ events, highlight, big }: { events: AdminEvent[]; highlight?: string; big?: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 30000); return () => window.clearInterval(t); }, []);
  return (
    <ul className={`feed ${big ? 'big' : ''}`}>
      {events.length === 0 && <li className="feed-empty">Nothing yet – activity appears here the moment it happens.</li>}
      {events.map((e) => (
        <li key={e._id} className={e._id === highlight ? 'new' : ''}>
          <span className="dot">{ICON[e.type] || '•'}</span>
          <div><p>{e.message}</p><time dateTime={e.at}>{ago(e.at)}</time></div>
        </li>
      ))}
    </ul>
  );
}
