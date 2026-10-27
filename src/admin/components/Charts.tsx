// Hand-built SVG charts for the Analytics tab.
// One series per chart → one validated colour (--chart in admin.css), no legend; the title names the data.
// Every bar has a hover/keyboard tooltip, and each chart has a "Table" view with the exact numbers.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

export interface Row { label: string; value: number; tipTitle?: string }
export interface Tip { x: number; y: number; title: string; value: string }
type ShowTip = (t: Tip | null) => void;

function useWidth(ref: RefObject<HTMLElement>) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return Math.max(280, w);
}

function niceScale(max: number, maxTicks = 4) {
  if (max <= 0) return { top: maxTicks, step: 1 };
  const raw = max / maxTicks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw)!);
  return { top: Math.ceil(max / step) * step, step };
}
// Column: 4px rounded data-end, square at the baseline
const colPath = (x: number, y: number, w: number, h: number) => {
  if (h <= 0) return '';
  const r = Math.min(4, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
};
const barPath = (x: number, y: number, w: number, h: number) => {
  if (w <= 0) return '';
  const r = Math.min(4, w, h / 2);
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
};

function tipFrom(e: { currentTarget: Element }, title: string, value: string): Tip {
  const hit = e.currentTarget.getBoundingClientRect();
  const bar = (e.currentTarget.nextElementSibling as Element | null)?.getBoundingClientRect();
  return {
    x: Math.min(Math.max(hit.left + hit.width / 2, 90), window.innerWidth - 90),
    y: Math.max(bar && bar.height ? bar.top : hit.top, hit.top),
    title, value,
  };
}

/** Vertical columns over an ordered axis (days, hours) */
export function ColumnChart({ rows, title, fmt = String, tipFmt = fmt, xLabel = (r) => r.label, unit, onTip }: {
  rows: Row[]; title: string; fmt?: (n: number) => string; tipFmt?: (n: number) => string; xLabel?: (r: Row) => string; unit: string; onTip: ShowTip;
}) {
  const box = useRef<HTMLDivElement>(null);
  const W = useWidth(box);
  const H = 204, padL = 44, padR = 8, padT = 22, padB = 30;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const max = Math.max(0, ...rows.map((r) => r.value));
  const { top, step } = niceScale(max);
  const band = plotW / Math.max(1, rows.length);
  const bw = Math.max(2, Math.min(24, band - 2)); // 2px surface gap between neighbours
  const y = (v: number) => padT + plotH - (v / top) * plotH;
  const labelEvery = Math.max(1, Math.ceil(rows.length / Math.max(1, Math.floor(plotW / 54))));
  const labelOffset = labelEvery > 1 ? Math.floor(labelEvery / 2) : 0; // keep the first label clear of the "0"
  const maxIdx = max > 0 ? rows.findIndex((r) => r.value === max) : -1;
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);

  return (
    <div className="an-chart" ref={box}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        <g className="grid">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} />
              <text x={padL - 8} y={y(v) + 4} textAnchor="end">{fmt(v)}</text>
            </g>
          ))}
        </g>
        <line className="base" x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} />
        {rows.map((r, i) => {
          const cx = padL + band * i + band / 2;
          return (
            <g key={r.label + i}>
              <g>
                <rect className="hit" x={padL + band * i} y={padT} width={band} height={plotH} tabIndex={0}
                  onMouseEnter={(e) => onTip(tipFrom(e, r.tipTitle || r.label, `${unit}: ${tipFmt(r.value)}`))} onMouseLeave={() => onTip(null)}
                  onFocus={(e) => onTip(tipFrom(e, r.tipTitle || r.label, `${unit}: ${tipFmt(r.value)}`))} onBlur={() => onTip(null)} />
                <path className="bar" d={colPath(cx - bw / 2, y(r.value), bw, (r.value / top) * plotH)} />
              </g>
              {i === maxIdx && <text className="val" x={cx} y={y(r.value) - 6} textAnchor="middle">{fmt(r.value)}</text>}
              {i % labelEvery === labelOffset && <text x={cx} y={H - 6} textAnchor="middle">{xLabel(r)}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Horizontal bars for named categories (value at the tip) */
export function BarChart({ rows, title, unit, onTip }: { rows: Row[]; title: string; unit: string; onTip: ShowTip }) {
  const box = useRef<HTMLDivElement>(null);
  const W = useWidth(box);
  if (!rows.length || rows.every((r) => !r.value)) return <div className="an-chart" ref={box}><p className="an-empty">No data in this period yet.</p></div>;
  const rowH = 34, bh = 16, padT = 4;
  const labelW = Math.min(150, Math.max(124, Math.round(W * 0.42)));
  const plotW = W - labelW - 44;
  const max = Math.max(...rows.map((r) => r.value), 1);
  const H = padT + rows.length * rowH;
  const fit = Math.max(4, Math.floor((labelW - 14) / 7)); // ~7px per character at 12px
  return (
    <div className="an-chart" ref={box}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        <line className="base" x1={labelW} x2={labelW} y1={0} y2={H} />
        {rows.map((r, i) => {
          const yTop = padT + i * rowH;
          const w = (r.value / max) * plotW;
          const name = r.label.length > fit ? r.label.slice(0, fit - 1) + '…' : r.label;
          return (
            <g key={r.label}>
              <text className="cat" x={labelW - 10} y={yTop + rowH / 2 + 4} textAnchor="end">{name}</text>
              <g>
                <rect className="hit" x={0} y={yTop} width={W} height={rowH} tabIndex={0}
                  onMouseEnter={(e) => onTip(tipFrom(e, r.label, `${unit}: ${r.value}`))} onMouseLeave={() => onTip(null)}
                  onFocus={(e) => onTip(tipFrom(e, r.label, `${unit}: ${r.value}`))} onBlur={() => onTip(null)} />
                <path className="bar" d={barPath(labelW, yTop + (rowH - bh) / 2, w, bh)} />
              </g>
              <text className="val" x={labelW + w + 6} y={yTop + rowH / 2 + 4}>{r.value}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function DataTable({ rows, colA, colB, fmt = String }: { rows: Row[]; colA: string; colB: string; fmt?: (n: number) => string }) {
  return (
    <div className="an-table-wrap">
      <table className="an-table">
        <thead><tr><th>{colA}</th><th>{colB}</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={r.label + i}><td>{r.tipTitle || r.label}</td><td>{fmt(r.value)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

/** The floating tooltip shared by all charts */
export function ChartTooltip({ tip }: { tip: Tip | null }) {
  const [shown, setShown] = useState(tip);
  useEffect(() => setShown(tip), [tip]);
  if (!shown) return null;
  return <div className="an-tip" role="tooltip" style={{ left: shown.x, top: shown.y }}><b>{shown.title}</b><span>{shown.value}</span></div>;
}
