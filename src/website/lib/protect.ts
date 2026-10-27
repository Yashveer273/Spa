// Discourages copying the website's photos, video and text.
// Note: nothing in a browser can fully stop this – phone screenshots, screen recording or a camera always work.
// These measures stop the casual ways (right-click → Save, drag, select + copy, Ctrl+S/P/U, printing).
// Forms and anything marked className="allow-copy" (booking IDs, offer codes) can still be selected and copied.

const ALLOWED = 'input, textarea, select, [contenteditable="true"], .allow-copy';
const MEDIA = 'img, video, picture, svg, canvas, .media';

const inAllowed = (node: EventTarget | Node | null) => {
  const el = node instanceof Element ? node : node instanceof Node ? node.parentElement : null;
  return Boolean(el?.closest(ALLOWED));
};

export function protectContent() {
  const root = document.documentElement;
  root.classList.add('protected');

  // No right-click menu on photos/video (Save image as…, Copy image)
  document.addEventListener('contextmenu', (e) => {
    const t = e.target as Element;
    if (t.closest?.(MEDIA) || !inAllowed(t)) e.preventDefault();
  });
  // No dragging photos to the desktop
  document.addEventListener('dragstart', (e) => {
    if ((e.target as Element).closest?.(MEDIA)) e.preventDefault();
  });
  // No copying/cutting text, except in forms and allowed spots
  const blockCopy = (e: ClipboardEvent) => {
    const sel = document.getSelection();
    if (inAllowed(document.activeElement) || (sel && sel.anchorNode && inAllowed(sel.anchorNode))) return;
    e.preventDefault();
  };
  document.addEventListener('copy', blockCopy);
  document.addEventListener('cut', blockCopy);

  // Shortcuts: save page, print, view source, select all (outside forms)
  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    if ((mod && ['s', 'p', 'u'].includes(k)) || (mod && k === 'a' && !inAllowed(document.activeElement))) e.preventDefault();
    if (k === 'printscreen') hideBriefly();
  });
  // Windows "Print Screen" fires on key up; wipe what it copied where the browser allows it
  document.addEventListener('keyup', (e) => {
    if (e.key === 'PrintScreen') {
      hideBriefly();
      navigator.clipboard?.writeText('').catch(() => {});
    }
  });

  // Screenshot tools (Snipping Tool, Snip & Sketch) and app switchers take focus away – blur the page meanwhile.
  // Re-shown as soon as the page has focus again.
  const blur = () => root.classList.add('privacy-blur');
  const unblur = () => root.classList.remove('privacy-blur');
  window.addEventListener('blur', () => { if (!document.querySelector('iframe:focus')) blur(); });
  window.addEventListener('focus', unblur);
  document.addEventListener('visibilitychange', () => (document.hidden ? blur() : unblur()));
  document.addEventListener('pointerdown', unblur, true);

  function hideBriefly() {
    blur();
    window.setTimeout(unblur, 1500);
  }
}
