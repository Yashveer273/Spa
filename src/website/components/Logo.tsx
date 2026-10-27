// AAPNA SPA logo: a lotus mark (drawn in the current text colour) + the name.
// Used by the header, footer, login page and admin. The browser-tab icon is public/assets/images/logo.svg.

export const BRAND = 'AAPNA SPA';

export function LotusMark({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 20c-3-3-4-7-4-10 0-3 2-6 4-8 2 2 4 5 4 8 0 3-1 7-4 10Z" />
      <path d="M20 20c-4-1-8-4-9-8 3 0 6 1 8 3M20 20c4-1 8-4 9-8-3 0-6 1-8 3" />
      <path d="M20 20c-5 1-11 0-15-4 3-1 7-1 10 1M20 20c5 1 11 0 15-4-3-1-7-1-10 1" />
      <path d="M2 20h11M27 20h11" />
    </svg>
  );
}
