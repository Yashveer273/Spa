export const rupee = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN');

const pad = (n: number) => String(n).padStart(2, '0');
/** Local date as YYYY-MM-DD */
export const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hourLabel = (h: number) => `${h % 12 || 12}:00 ${h < 12 ? 'AM' : 'PM'}`;

export const longDate = (ymd: string) =>
  new Date(ymd + 'T00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
export const shortDate = (ymd: string) =>
  new Date(ymd + 'T00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
