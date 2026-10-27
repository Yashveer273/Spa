// The live catalog (therapists, offers, prices) from the server, which the admin can edit.
// Shows the last copy this browser saw (or the built-in one) straight away, then swaps in the fresh one.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BUNDLED_CATALOG, makeCatalog, type Catalog, type CatalogData } from '../../../shared/catalog';

const STORE_KEY = 'apkaspa:catalog';

function lastSeen(): CatalogData {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null') as CatalogData | null;
    if (saved?.therapists && Array.isArray(saved.offers)) return saved;
  } catch { /* ignore */ }
  return BUNDLED_CATALOG;
}

type CatalogValue = Catalog & { /** true once the server's copy has arrived (or couldn't be fetched) */ ready: boolean };
const CatalogContext = createContext<CatalogValue | null>(null);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<CatalogData>(lastSeen);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => fetch('/api/catalog', { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<CatalogData>) : Promise.reject(new Error(String(r.status)))))
      .then((fresh) => {
        if (!alive || !fresh?.therapists) return;
        setData(fresh);
        try { localStorage.setItem(STORE_KEY, JSON.stringify(fresh)); } catch { /* ignore */ }
      })
      .catch(() => { /* offline – keep the copy we have */ })
      .finally(() => { if (alive) setReady(true); });
    load();
    // Coming back to the tab picks up changes the admin made meanwhile
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  const value = useMemo(() => ({ ...makeCatalog(data), ready }), [data, ready]);
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogValue {
  const c = useContext(CatalogContext);
  if (!c) throw new Error('useCatalog must be used inside <CatalogProvider>');
  return c;
}
