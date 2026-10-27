import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { shrinkImage } from '../../website/lib/image';
import { adminApi, rupee, type AdminCatalog, type AdminContact, type AdminOffer, type AdminTherapist, type TherapistType } from '../api';

type Props = { refreshKey: number; onError: (e: unknown) => void; toast: (m: string, err?: boolean) => void };

const TYPE_LABEL: Record<TherapistType, string> = { basic: 'Basic Therapist', therapist: 'Therapist', premium: 'Premium Therapist' };
const TYPES = Object.keys(TYPE_LABEL) as TherapistType[];

/**
 * Google Drive share link → direct image address (same rule as normalizePhoto() in backend/server.js).
 * Returns null when it isn't a usable link.
 */
export const isUploaded = (v: string) => /^\/api\/photos\/[a-f0-9]{24}\.(jpg|png|webp)$/.test(String(v || '').trim());

export function photoSrc(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  if (isUploaded(s)) return s;
  if (/drive\.google\.com\/drive\/(u\/\d+\/)?folders\//.test(s)) return null;
  const m = s.match(/(?:drive|docs)\.google\.com\/(?:file\/d\/|(?:open|uc)\?(?:[^#]*&)?id=)([\w-]{10,})/) || s.match(/googleusercontent\.com\/d\/([\w-]{10,})/);
  if (m) return `https://lh3.googleusercontent.com/d/${m[1]}`;
  if (/^https:\/\/\S{4,}$/.test(s)) return s;
  if (/^[\w.-]+\.(jpe?g|png|webp|gif|avif)$/i.test(s)) return '/assets/images/therapists/' + s;
  return null;
}

/** Loads the catalog and saves changes (with the version, so two admins can't overwrite each other). */
function useCatalogData({ refreshKey, onError, toast }: Props) {
  const [data, setData] = useState<AdminCatalog | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { adminApi.catalog().then(setData).catch(onError); }, [refreshKey, onError]);
  const save = useCallback(async (patch: Partial<Pick<AdminCatalog, 'therapists' | 'offers' | 'contact'>>, note: string) => {
    if (!data) return false;
    setSaving(true);
    try {
      const r = await adminApi.saveCatalog({ ...patch, version: data.version, note });
      setData({ ...data, ...patch, version: r.version });
      toast('Saved – live on the website');
      adminApi.catalog().then(setData).catch(() => {}); // pick up the cleaned-up copy (e.g. converted photo links)
      return true;
    } catch (e) {
      onError(e);
      return false;
    } finally {
      setSaving(false);
    }
  }, [data, onError, toast]);
  return { data, save, saving };
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button type="button" className="modal-x" aria-label="Close" onClick={onClose}>×</button></header>
        {children}
      </div>
    </div>
  );
}

function Field({ label, hint, children, wide }: { label: string; hint?: ReactNode; children: ReactNode; wide?: boolean }) {
  return <label className={`field ${wide ? 'wide' : ''}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function PhotoThumb({ photo, name, big }: { photo: string; name: string; big?: boolean }) {
  const src = photoSrc(photo);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <div className={`thumb ${big ? 'big' : ''}`}>
      {src && !failed
        ? <img src={src} alt={name} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        : <span>{!photo ? 'No photo' : !src ? 'Not a valid link' : "Can't load"}</span>}
    </div>
  );
}

// =============== Therapists ===============
const blankTherapist = (): AdminTherapist => ({ name: '', speciality: '', price: 999, rating: 5, reviews: 0, photo: '' });

function TherapistForm({ initial, type, onSave, onClose, saving }: {
  initial: AdminTherapist; type: TherapistType; saving: boolean;
  onSave: (t: AdminTherapist, type: TherapistType) => void; onClose: () => void;
}) {
  const [t, setT] = useState<AdminTherapist>(initial);
  const [ty, setTy] = useState<TherapistType>(type);
  const set = <K extends keyof AdminTherapist>(k: K, v: AdminTherapist[K]) => setT((x) => ({ ...x, [k]: v }));
  const photoOk = !t.photo.trim() || photoSrc(t.photo) !== null;
  const [photoMode, setPhotoMode] = useState<'upload' | 'link'>(() => (t.photo && !isUploaded(t.photo) ? 'link' : 'upload'));
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ text: string; bad?: boolean }>({ text: '' });
  const upload = async (file: File) => {
    if (!file.type.startsWith('image/')) { setUploadMsg({ text: 'Please choose a photo (JPG, PNG or WebP).', bad: true }); return; }
    if (file.size > 25 * 1024 * 1024) { setUploadMsg({ text: 'That file is too big (over 25 MB).', bad: true }); return; }
    setUploading(true); setUploadMsg({ text: '' });
    try {
      const { url } = await adminApi.uploadPhoto(await shrinkImage(file));
      set('photo', url);
      setUploadMsg({ text: 'Photo uploaded ✓ – press Save to put it on the website.' });
    } catch (e) {
      setUploadMsg({ text: (e as Error).message, bad: true });
    } finally {
      setUploading(false);
    }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); if (photoOk) onSave(t, ty); };

  return (
    <form className="edit-form" onSubmit={submit}>
      <div className="photo-row">
        <PhotoThumb photo={t.photo} name={t.name} big />
        <div className="photo-pick">
          <span className="photo-label">Photo</span>
          <div className="seg" role="tablist" aria-label="Photo source">
            <button type="button" role="tab" aria-selected={photoMode === 'upload'} className={photoMode === 'upload' ? 'on' : ''} onClick={() => setPhotoMode('upload')}>Upload photo</button>
            <button type="button" role="tab" aria-selected={photoMode === 'link'} className={photoMode === 'link' ? 'on' : ''} onClick={() => setPhotoMode('link')}>Google Drive link</button>
          </div>
          {photoMode === 'upload' ? (
            <div className="upload-box">
              <label className={`btn ${uploading ? 'busy' : ''}`}>
                {uploading ? 'Uploading…' : isUploaded(t.photo) ? 'Choose another photo' : 'Choose photo'}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/*" hidden disabled={uploading}
                  onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) upload(file); }} />
              </label>
              <small className={uploadMsg.bad ? 'bad' : ''}>
                {uploadMsg.text || (isUploaded(t.photo) ? 'Photo uploaded ✓ – it is saved safely in the database.' : 'JPG, PNG or WebP from your phone or computer. It is resized automatically.')}
              </small>
            </div>
          ) : (
            <Field label="" hint={
              !photoOk
                ? <b className="bad">This isn't a link to a single photo. In Google Drive open the photo (not the folder) → Share → Copy link.</b>
                : <>In Google Drive: right-click the photo → <b>Share</b> → General access: <b>Anyone with the link</b> → <b>Copy link</b>, then paste it here. If the preview says "Can't load", the photo isn't shared publicly yet.</>
            }>
              <input value={isUploaded(t.photo) ? '' : t.photo} onChange={(e) => set('photo', e.target.value)} placeholder="https://drive.google.com/file/d/…/view?usp=sharing" aria-label="Google Drive link" />
            </Field>
          )}
        </div>
      </div>
      <div className="form-grid">
        <Field label="Name *"><input required maxLength={40} value={t.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Speciality *"><input required maxLength={60} value={t.speciality} onChange={(e) => set('speciality', e.target.value)} placeholder="Relaxation Massage" /></Field>
        <Field label="Price (₹) *"><input required type="number" min={1} max={100000} step={1} value={t.price} onChange={(e) => set('price', e.target.value === '' ? ('' as unknown as number) : Number(e.target.value))} /></Field>
        <Field label="Type">
          <select value={ty} onChange={(e) => setTy(e.target.value as TherapistType)}>
            {TYPES.map((x) => <option key={x} value={x}>{TYPE_LABEL[x]}</option>)}
          </select>
        </Field>
        <Field label="Rating (0–5)"><input type="number" min={0} max={5} step={0.1} value={t.rating} onChange={(e) => set('rating', Number(e.target.value))} /></Field>
        <Field label="Number of reviews"><input type="number" min={0} step={1} value={t.reviews} onChange={(e) => set('reviews', Number(e.target.value))} /></Field>
        <Field label="Experience" hint="e.g. 3+ years"><input maxLength={40} value={t.experience || ''} onChange={(e) => set('experience', e.target.value)} /></Field>
        <Field label="Specialises in" hint="e.g. Swedish, Deep tissue"><input maxLength={80} value={t.specializes || ''} onChange={(e) => set('specializes', e.target.value)} /></Field>
        <Field label="Languages" hint="e.g. Hindi, English"><input maxLength={80} value={t.languages || ''} onChange={(e) => set('languages', e.target.value)} /></Field>
        <Field wide label="About" hint="Shown on the therapist's booking page. Leave empty to use the standard text.">
          <textarea rows={3} maxLength={600} value={t.about || ''} onChange={(e) => set('about', e.target.value)} />
        </Field>
        <label className="check wide"><input type="checkbox" checked={!t.hidden} onChange={(e) => set('hidden', !e.target.checked)} /> Show on the website (customers can book)</label>
      </div>
      <footer>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn primary" disabled={saving || uploading || !photoOk}>{saving ? 'Saving…' : 'Save'}</button>
      </footer>
    </form>
  );
}

export function TherapistsPanel(props: Props) {
  const { data, save, saving } = useCatalogData(props);
  const [type, setType] = useState<TherapistType>('basic');
  const [editing, setEditing] = useState<{ index: number; t: AdminTherapist } | null>(null);
  const close = useCallback(() => setEditing(null), []);
  if (!data) return <section className="panel"><p className="empty">Loading…</p></section>;
  const list = data.therapists[type] || [];

  const saveList = (therapists: AdminCatalog['therapists'], note: string) => save({ therapists }, note);
  const withType = (ty: TherapistType, next: AdminTherapist[]) => ({ ...data.therapists, [ty]: next });

  const onSave = async (t: AdminTherapist, newType: TherapistType) => {
    const all = { ...data.therapists };
    if (editing && editing.index >= 0) all[type] = list.filter((_, i) => i !== editing.index);
    if (newType === type && editing && editing.index >= 0) {
      all[type] = [...list]; all[type][editing.index] = t; // keep its place
    } else {
      all[newType] = [...(all[newType] || []), t];
    }
    if (await saveList(all, `${editing && editing.index >= 0 ? 'edited' : 'added'} ${t.name}`)) { setEditing(null); setType(newType); }
  };
  const move = (i: number, d: -1 | 1) => {
    const next = [...list]; const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    saveList(withType(type, next), `moved ${list[i].name}`);
  };
  const toggle = (i: number) => {
    const next = list.map((x, k) => (k === i ? { ...x, hidden: !x.hidden } : x));
    saveList(withType(type, next), `${list[i].hidden ? 'showed' : 'hid'} ${list[i].name}`);
  };
  const remove = (i: number) => {
    if (!window.confirm(`Delete ${list[i].name}? Customers won't be able to book them any more. (Tip: "Hide" keeps them for later.)`)) return;
    saveList(withType(type, list.filter((_, k) => k !== i)), `deleted ${list[i].name}`);
  };

  return (
    <section className="panel">
      <div className="toolbar">
        <div className="chips">
          {TYPES.map((ty) => (
            <button key={ty} className={`chip ${ty === type ? 'on' : ''}`} onClick={() => setType(ty)}>
              {TYPE_LABEL[ty]} <b>{data.therapists[ty]?.length || 0}</b>
            </button>
          ))}
        </div>
        <button className="btn primary" onClick={() => setEditing({ index: -1, t: blankTherapist() })}>+ Add therapist</button>
      </div>
      {!list.length && <p className="empty">No therapists in this list yet.</p>}
      <div className="t-admin-grid">
        {list.map((t, i) => (
          <article key={t.key || i} className={`t-admin ${t.hidden ? 'is-hidden' : ''}`}>
            <PhotoThumb photo={t.photo} name={t.name} />
            <div className="t-admin-body">
              <b>{t.name}</b>
              <small>{t.speciality}</small>
              <span>{rupee(t.price)} · ★ {t.rating} ({t.reviews})</span>
              {t.hidden && <em className="pill">Hidden</em>}
            </div>
            <div className="t-admin-actions">
              <button className="chip" onClick={() => setEditing({ index: i, t })}>Edit</button>
              <button className="chip" onClick={() => toggle(i)} disabled={saving}>{t.hidden ? 'Show' : 'Hide'}</button>
              <button className="chip icon" title="Move up" aria-label="Move up" onClick={() => move(i, -1)} disabled={saving || i === 0}>↑</button>
              <button className="chip icon" title="Move down" aria-label="Move down" onClick={() => move(i, 1)} disabled={saving || i === list.length - 1}>↓</button>
              <button className="chip danger" onClick={() => remove(i)} disabled={saving}>Delete</button>
            </div>
          </article>
        ))}
      </div>
      {editing && (
        <Modal title={editing.index >= 0 ? `Edit ${editing.t.name}` : 'Add a therapist'} onClose={close}>
          <TherapistForm initial={editing.t} type={type} saving={saving} onSave={onSave} onClose={close} />
        </Modal>
      )}
    </section>
  );
}

// =============== Offers ===============
const blankOffer = (): AdminOffer => ({ code: '', title: '', desc: '', kind: 'percent', value: 10 });
const offerBadge = (o: AdminOffer) => (o.kind === 'percent' ? `${o.value}% off${o.max ? ` (max ${rupee(o.max)})` : ''}` : `${rupee(o.value)} off`);

function OfferForm({ initial, onSave, onClose, saving }: { initial: AdminOffer; saving: boolean; onSave: (o: AdminOffer) => void; onClose: () => void }) {
  const [o, setO] = useState<AdminOffer>(initial);
  const set = <K extends keyof AdminOffer>(k: K, v: AdminOffer[K]) => setO((x) => ({ ...x, [k]: v }));
  return (
    <form className="edit-form" onSubmit={(e) => { e.preventDefault(); onSave(o); }}>
      <div className="form-grid">
        <Field label="Code *" hint="Customers type this at checkout. Letters and numbers only.">
          <input required pattern="[A-Za-z0-9]{3,20}" maxLength={20} value={o.code} onChange={(e) => set('code', e.target.value.toUpperCase().replace(/\s/g, ''))} placeholder="DIWALI25" />
        </Field>
        <Field label="Title *"><input required maxLength={60} value={o.title} onChange={(e) => set('title', e.target.value)} placeholder="Diwali Offer" /></Field>
        <Field wide label="Description"><input maxLength={200} value={o.desc} onChange={(e) => set('desc', e.target.value)} placeholder="Get 25% off your at-home massage." /></Field>
        <Field label="Discount type">
          <select value={o.kind} onChange={(e) => set('kind', e.target.value as AdminOffer['kind'])}>
            <option value="percent">Percent off (%)</option>
            <option value="flat">Fixed amount off (₹)</option>
          </select>
        </Field>
        <Field label={o.kind === 'percent' ? 'Percent off *' : 'Amount off (₹) *'}>
          <input required type="number" min={1} max={o.kind === 'percent' ? 90 : 100000} step={1} value={o.value} onChange={(e) => set('value', Number(e.target.value))} />
        </Field>
        {o.kind === 'percent' && (
          <Field label="Maximum discount (₹)" hint="Optional cap, e.g. 300">
            <input type="number" min={0} step={1} value={o.max ?? ''} onChange={(e) => set('max', e.target.value === '' ? undefined : Number(e.target.value))} />
          </Field>
        )}
        <label className="check wide"><input type="checkbox" checked={!o.disabled} onChange={(e) => set('disabled', !e.target.checked)} /> Active (the code works at checkout)</label>
        <label className="check wide"><input type="checkbox" checked={!o.hidden} onChange={(e) => set('hidden', !e.target.checked)} /> Show on the Offers page (untick for a secret code)</label>
      </div>
      <footer>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </footer>
    </form>
  );
}

export function OffersPanel(props: Props) {
  const { data, save, saving } = useCatalogData(props);
  const [editing, setEditing] = useState<{ index: number; o: AdminOffer } | null>(null);
  const close = useCallback(() => setEditing(null), []);
  if (!data) return <section className="panel"><p className="empty">Loading…</p></section>;
  const offers = data.offers;

  const onSave = async (o: AdminOffer) => {
    const next = [...offers];
    if (editing && editing.index >= 0) next[editing.index] = o; else next.push(o);
    if (await save({ offers: next }, `${editing && editing.index >= 0 ? 'edited' : 'added'} offer ${o.code}`)) setEditing(null);
  };
  const toggle = (i: number) => save({ offers: offers.map((x, k) => (k === i ? { ...x, disabled: !x.disabled } : x)) }, `${offers[i].disabled ? 'turned on' : 'turned off'} ${offers[i].code}`);
  const remove = (i: number) => {
    if (!window.confirm(`Delete the offer ${offers[i].code}? The code will stop working at checkout.`)) return;
    save({ offers: offers.filter((_, k) => k !== i) }, `deleted offer ${offers[i].code}`);
  };

  return (
    <section className="panel">
      <div className="toolbar">
        <span className="muted">{offers.length} offer{offers.length === 1 ? '' : 's'} · changes appear on the website's Offers page and checkout straight away</span>
        <button className="btn primary" onClick={() => setEditing({ index: -1, o: blankOffer() })}>+ Add offer</button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Code</th><th>Offer</th><th>Discount</th><th>Status</th><th /></tr></thead>
          <tbody>
            {offers.map((o, i) => (
              <tr key={o.code} className={o.disabled ? 'dim' : ''}>
                <td data-label="Code"><b className="code">{o.code}</b></td>
                <td data-label="Offer"><b>{o.title}</b><small>{o.desc}</small></td>
                <td data-label="Discount">{offerBadge(o)}</td>
                <td data-label="Status">
                  {o.disabled ? <em className="pill off">Off</em> : <em className="pill on">Active</em>}
                  {!o.disabled && o.hidden && <em className="pill">Secret code</em>}
                </td>
                <td className="row-actions">
                  <button className="chip" onClick={() => setEditing({ index: i, o })}>Edit</button>
                  <button className="chip" onClick={() => toggle(i)} disabled={saving}>{o.disabled ? 'Turn on' : 'Turn off'}</button>
                  <button className="chip danger" onClick={() => remove(i)} disabled={saving}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!offers.length && <p className="empty">No offers yet. Add one to show it on the website.</p>}
      </div>
      {editing && (
        <Modal title={editing.index >= 0 ? `Edit offer ${editing.o.code}` : 'Add an offer'} onClose={close}>
          <OfferForm initial={editing.o} saving={saving} onSave={onSave} onClose={close} />
        </Modal>
      )}
    </section>
  );
}

// =============== Contact details ===============
const showPhone = (d: string) => (d.length === 12 && d.startsWith('91') ? `+91 ${d.slice(2, 7)} ${d.slice(7)}` : d ? '+' + d : '');

export function ContactPanel(props: Props) {
  const { data, save, saving } = useCatalogData(props);
  const [draft, setDraft] = useState<AdminContact | null>(null); // null = showing what's saved
  if (!data) return <section className="panel"><p className="empty">Loading…</p></section>;
  const form = draft || data.contact;
  const set = (k: keyof AdminContact, v: string) => setDraft({ ...form, [k]: v });
  const upis = form.upiAccounts || [];
  const setUpis = (next: typeof upis, active = form.upiActive) => setDraft({ ...form, upiAccounts: next, upiActive: Math.min(active, Math.max(0, next.length - 1)) });
  const setUpi = (i: number, patch: Partial<{ upiId: string; upiName: string }>) => setUpis(upis.map((a, k) => (k === i ? { ...a, ...patch } : a)));
  const changed = draft !== null && JSON.stringify(draft) !== JSON.stringify(data.contact);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await save({ contact: form }, 'contact details')) setDraft(null); // show the cleaned-up saved copy
  };

  return (
    <section className="panel">
      <form className="edit-form contact-form" onSubmit={submit}>
        <p className="muted">These appear on the website (home page contact cards, footer, booking pages and help links). Leave a box empty to hide it.</p>
        <div className="form-grid">
          <Field label="WhatsApp number" hint={form.whatsapp ? <>Opens <b>wa.me/{form.whatsapp.replace(/\D/g, '')}</b></> : '10-digit mobile number'}>
            <input inputMode="tel" value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} placeholder="92440 92230" />
          </Field>
          <Field label="Phone number (Call Now)" hint={form.phone ? showPhone(form.phone.replace(/\D/g, '').length === 10 ? '91' + form.phone.replace(/\D/g, '') : form.phone.replace(/\D/g, '')) : '10-digit mobile number'}>
            <input inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="92440 92230" />
          </Field>
          <Field label="Instagram" hint="Username (aapnaspa) or the profile link">
            <input value={form.instagram} onChange={(e) => set('instagram', e.target.value)} placeholder="aapnaspa" />
          </Field>
          <Field label="Email">
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="hello@aapnaspa.com" />
          </Field>
          <Field label="Address (footer)"><input maxLength={120} value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Vijay Nagar, Indore" /></Field>
          <Field label="Opening hours (footer)"><input maxLength={60} value={form.hours} onChange={(e) => set('hours', e.target.value)} placeholder="Daily, 10 AM - 10 PM" /></Field>
        </div>

        <div className="upi-box">
          <div className="upi-box-head">
            <h3>Payments – your UPI IDs</h3>
            <span className="muted">{upis.length ? 'Customers pay the selected UPI ID by QR, then upload a screenshot + UTR for you to verify.' : 'Online payment is OFF until you add a UPI ID. Example: yourname@okhdfcbank'}</span>
          </div>
          {upis.map((a, i) => (
            <div key={i} className={`upi-acct ${i === form.upiActive ? 'active' : ''}`}>
              <label className="upi-radio" title="Use this one for payments">
                <input type="radio" name="upiActive" checked={i === form.upiActive} onChange={() => setDraft({ ...form, upiActive: i })} />
                <span>{i === form.upiActive ? 'In use' : 'Use'}</span>
              </label>
              <div className="upi-fields">
                <input className="upi-id-in" value={a.upiId} onChange={(e) => setUpi(i, { upiId: e.target.value.trim().toLowerCase() })} placeholder="yourname@okhdfcbank" autoCapitalize="off" spellCheck={false} aria-label={`UPI ID ${i + 1}`} />
                <input className="upi-name-in" maxLength={60} value={a.upiName} onChange={(e) => setUpi(i, { upiName: e.target.value })} placeholder="Payee name (e.g. AAPNA SPA)" aria-label={`Payee name ${i + 1}`} />
              </div>
              <button type="button" className="upi-del" aria-label="Remove this UPI ID" onClick={() => setUpis(upis.filter((_, k) => k !== i), i <= form.upiActive ? Math.max(0, form.upiActive - 1) : form.upiActive)}>✕</button>
            </div>
          ))}
          {upis.length < 5 && (
            <button type="button" className="btn upi-add" onClick={() => setUpis([...upis, { upiId: '', upiName: '' }], upis.length ? form.upiActive : 0)}>+ Add UPI ID</button>
          )}
        </div>
        <footer>
          <button type="button" className="btn" disabled={!changed || saving} onClick={() => setDraft(null)}>Undo changes</button>
          <button type="submit" className="btn primary" disabled={!changed || saving}>{saving ? 'Saving…' : 'Save – update website'}</button>
        </footer>
      </form>
    </section>
  );
}
