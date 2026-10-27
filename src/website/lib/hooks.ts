import { useEffect, type RefObject } from 'react';

/** Puts a class on <body> while a page is shown (the page stylesheets use these, e.g. "auth-page"). */
export function useBodyClass(className: string) {
  useEffect(() => {
    const names = className.split(' ').filter(Boolean);
    document.body.classList.add(...names);
    return () => document.body.classList.remove(...names);
  }, [className]);
}

export function useTitle(title: string) {
  useEffect(() => { document.title = title; }, [title]);
}

/** Fades in ".reveal" elements inside the given container as they scroll into view. */
export function useReveal(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const els = root.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.15 });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [ref]);
}

/** Closes something when Escape is pressed. */
export function useEscape(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onEscape(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [active, onEscape]);
}

/** Copies text; if the clipboard is blocked, shows it in a prompt (unless promptLabel is null). */
export async function copyText(text: string, promptLabel: string | null = 'Copy this:'): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    if (!ok && promptLabel !== null) window.prompt(promptLabel, text);
    return ok;
  }
}
