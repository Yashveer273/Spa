import { useEffect, useState } from 'react';
import { adminApi, rupee, type Analytics as Data } from '../api';
import { BarChart, ChartTooltip, ColumnChart, DataTable, type Row, type Tip } from './Charts';

const compact = (n: number) => n >= 1e5 ? (n / 1e5).toFixed(n % 1e5 ? 1 : 0) + 'L' : n >= 1000 ? (n / 1000).toFixed(n % 1000 ? 1 : 0) + 'K' : String(n);
const money = (n: number) => '₹' + compact(n);
const shortDate = (ymd: string) => new Date(ymd + 'T00:00:00+05:30').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
const longDate = (ymd: string) => new Date(ymd + 'T00:00:00+05:30').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;

interface ChartDef {
  id: string; wide?: boolean; kind: 'col' | 'bar'; title: string; sub: string; colA: string; col: string; rows: Row[];
  fmt?: (n: number) => string; tableFmt?: (n: number) => string; xLabel?: (r: Row) => string;
}

function defs(d: Data): ChartDef[] {
  const range = `last ${d.days} days`;
  const day = (x: { date: string }) => ({ label: x.date, tipTitle: longDate(x.date) });
  return [
    { id: 'perDay', wide: true, kind: 'col', title: 'Bookings per day', sub: `${d.total} bookings in the ${range}`, colA: 'Date', col: 'Bookings',
      rows: d.daily.map((x) => ({ ...day(x), value: x.bookings })), xLabel: (r) => shortDate(r.label) },
    { id: 'revenue', wide: true, kind: 'col', title: 'Money paid online per day', colA: 'Date', col: 'Paid online',
      sub: `${rupee(d.tiles.revenue)} received online in the ${range} (cash collected at the door isn't included)`,
      rows: d.daily.map((x) => ({ ...day(x), value: x.revenue })), fmt: money, tableFmt: rupee, xLabel: (r) => shortDate(r.label) },
    { id: 'hours', kind: 'col', title: 'Busiest time slots', sub: 'Which session times customers pick', colA: 'Time', col: 'Bookings',
      rows: d.hours.map((h) => ({ label: hourLabel(h.hour), value: h.bookings })) },
    { id: 'therapists', kind: 'bar', title: 'Most booked therapists', sub: 'Top 8 in this period', colA: 'Therapist', col: 'Bookings', rows: d.therapists },
    { id: 'channels', kind: 'bar', title: 'How customers book', sub: 'WhatsApp request, pay online, or cash on delivery', colA: 'Method', col: 'Bookings', rows: d.channels },
    { id: 'statuses', kind: 'bar', title: 'Booking status', sub: 'Where this period’s bookings stand now', colA: 'Status', col: 'Bookings', rows: d.statuses },
    { id: 'offers', kind: 'bar', title: 'Offer codes used', sub: d.tiles.discountSum ? `${rupee(d.tiles.discountSum)} given as discounts` : 'Codes applied at checkout', colA: 'Code', col: 'Times used', rows: d.offers },
  ];
}

/** Analytics tab. `refreshKey` changes when a live event arrives, so the charts update by themselves. */
export function Analytics({ refreshKey, onError }: { refreshKey: number; onError: (e: unknown) => void }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [tables, setTables] = useState<Set<string>>(new Set());
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true); // keep the old charts on screen, dimmed
    adminApi.analytics(days).then((d) => { if (alive) setData(d); }).catch(onError).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [days, refreshKey, onError]);

  const toggle = (id: string) => setTables((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <section className="analytics">
      <div className="an-filter" role="group" aria-label="Date range">
        <span className="muted">Showing</span>
        {[7, 30, 90].map((d) => (
          <button key={d} className={`chip ${days === d ? 'on' : ''}`} onClick={() => setDays(d)}>Last {d} days</button>
        ))}
      </div>

      {data && (
        <>
          <div className="an-tiles">
            {([
              ['Average booking value', rupee(data.tiles.avgValue), 'per booking, excluding cancelled'],
              ['Paid online', rupee(data.tiles.revenue), `in the last ${data.days} days`],
              ['Repeat customers', String(data.tiles.repeatCustomers), `of ${data.tiles.uniqueCustomers} customers booked 2+ times`],
              ['Cancellation rate', `${data.tiles.cancelRate}%`, 'of bookings in this period'],
              ['Bookings with an offer', `${data.tiles.offerShare}%`, data.tiles.discountSum ? `${rupee(data.tiles.discountSum)} in discounts` : 'no discounts given'],
            ] as const).map(([l, v, s]) => <div key={l} className="an-tile"><small>{l}</small><b>{v}</b><span>{s}</span></div>)}
          </div>

          <div className="an-grid">
            {defs(data).map((c) => (
              <article key={c.id} className={`an-card ${c.wide ? 'wide' : ''} ${loading ? 'loading' : ''}`}>
                <div className="an-head">
                  <div><h3>{c.title}</h3><p className="an-sub">{c.sub}</p></div>
                  <button className="an-toggle" aria-pressed={tables.has(c.id)} onClick={() => toggle(c.id)}>{tables.has(c.id) ? 'Chart' : 'Table'}</button>
                </div>
                {tables.has(c.id)
                  ? <DataTable rows={c.rows} colA={c.colA} colB={c.col} fmt={c.tableFmt || c.fmt} />
                  : c.kind === 'col'
                    ? <ColumnChart rows={c.rows} title={c.title} unit={c.col} fmt={c.fmt} tipFmt={c.tableFmt || c.fmt} xLabel={c.xLabel} onTip={setTip} />
                    : <BarChart rows={c.rows} title={c.title} unit={c.col} onTip={setTip} />}
              </article>
            ))}
          </div>
        </>
      )}
      <ChartTooltip tip={tip} />
    </section>
  );
}
