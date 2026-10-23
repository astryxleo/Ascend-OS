import { useEffect, useRef, useState, type FormEvent, type ChangeEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Save, ShieldCheck, Upload, UserRound, MessageSquareText, ArrowUpRight, Flag, MousePointer2 } from 'lucide-react';

type Profile = {
  full_name?: string | null;
  username?: string | null;
  class_grade?: string | null;
  stream?: string | null;
  school_target?: string | null;
  avatar_url?: string | null;
  kingdom_flag_url?: string | null;
};

type Props = {
  supabase: SupabaseClient | null;
  profile: Profile | null;
  userId: string;
  onSaved: (profile: Profile) => void;
  setNotice: (message: string) => void;
  onContactOperator?: () => void;
};

async function compressAvatar(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  if (file.size > 12 * 1024 * 1024) throw new Error('Choose an image smaller than 12 MB.');
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const element = new Image();
    element.onload = () => { URL.revokeObjectURL(url); resolve(element); };
    element.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Unable to read that image.')); };
    element.src = url;
  });
  const scale = Math.min(1, 1200 / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image compression is not supported by this browser.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not compress image.')), 'image/webp', 0.86);
  });
}

export default function SettingsPanel({ supabase, profile, userId, onSaved, setNotice, onContactOperator }: Props) {
  const [name, setName] = useState(profile?.full_name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [school, setSchool] = useState((profile?.school_target ?? '').split(' · ')[0] ?? '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(profile?.avatar_url ?? '');
  const [kingdomFlagPreview, setKingdomFlagPreview] = useState(profile?.kingdom_flag_url ?? '');
  const [flagBusy, setFlagBusy] = useState(false);
  const [pendingFlagUrl, setPendingFlagUrl] = useState('');
  const [pendingFlagFile, setPendingFlagFile] = useState<File | null>(null);
  const [pendingFlagUrl, setPendingFlagUrl] = useState('');
  const [flagCropZoom, setFlagCropZoom] = useState(1);
  const [flagCropX, setFlagCropX] = useState(0);
  const [flagCropY, setFlagCropY] = useState(0);
  const [cursorSize, setCursorSize] = useState(() => {
    try { return Math.max(12, Math.min(48, Number(window.localStorage.getItem('ascend-cursor-size') || 23))); }
    catch { return 23; }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const currentUserId = useRef(userId);
  currentUserId.current = userId;

  useEffect(() => {
    if (!avatarPreview.startsWith('blob:')) return;
    return () => URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);

  // Rehydrate every form field when the signed-in account/profile changes.
  // The panel can stay mounted across navigation, so useState initializers alone
  // would otherwise leave the previous account's draft visible.
  useEffect(() => {
    setName(profile?.full_name ?? '');
    setUsername(profile?.username ?? '');
    setSchool((profile?.school_target ?? '').split(' · ')[0] ?? '');
    setAvatarFile(null);
    setAvatarPreview(profile?.avatar_url ?? '');
    setKingdomFlagPreview(profile?.kingdom_flag_url ?? '');
    setError('');
    setBusy(false);
  }, [userId, profile?.full_name, profile?.username, profile?.class_grade, profile?.stream, profile?.school_target, profile?.avatar_url, profile?.kingdom_flag_url]);

  function changeCursorSize(value: number) {
    const nextSize = Math.max(12, Math.min(48, Math.round(value)));
    setCursorSize(nextSize);
    try {
      window.localStorage.setItem('ascend-cursor-size', String(nextSize));
      const cursorId = Number(window.localStorage.getItem('ascend-cursor-id') || 6);
      window.dispatchEvent(new CustomEvent('ascend-cursor-settings-change', { detail: { id: cursorId, size: nextSize } }));
    } catch { /* Keep the control usable if browser storage is unavailable. */ }
  }

  function chooseAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (file && !file.type.startsWith('image/')) {
      setAvatarFile(null);
      setAvatarPreview(profile?.avatar_url ?? '');
      event.target.value = '';
      setError('Choose an image file.');
      return;
    }
    if (file && file.size > 12 * 1024 * 1024) {
      setAvatarFile(null);
      setAvatarPreview(profile?.avatar_url ?? '');
      event.target.value = '';
      setError('Choose an image smaller than 12 MB.');
      return;
    }
    setAvatarFile(file);
    if (file) {
      setAvatarPreview(URL.createObjectURL(file));
      setError('');
    }
  }

  function chooseKingdomFlag(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Choose an image file for your kingdom flag.'); return; }
    if (file.size > 12 * 1024 * 1024) { setError('Choose an image smaller than 12 MB.'); return; }
    if (pendingFlagUrl) URL.revokeObjectURL(pendingFlagUrl);
    setPendingFlagFile(file); setPendingFlagUrl(URL.createObjectURL(file));
    setFlagCropZoom(1); setFlagCropX(0); setFlagCropY(0); setError('');
  }

  async function saveKingdomFlag() {
    const file = pendingFlagFile;
    if (!file) return;
    if (!supabase) { setError('Supabase is not configured.'); return; }
    setFlagBusy(true); setError('');
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => { const element = new Image(); element.onload = () => resolve(element); element.onerror = () => reject(new Error('Unable to read that image.')); element.src = pendingFlagUrl; });
      const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 900;
      const context = canvas.getContext('2d'); if (!context) throw new Error('Image crop is not supported by this browser.');
      const scale = Math.max(canvas.width / image.width, canvas.height / image.height) * flagCropZoom;
      const width = image.width * scale, height = image.height * scale;
      const x = (canvas.width - width) / 2 + (canvas.width - width) * flagCropX / 100;
      const y = (canvas.height - height) / 2 + (canvas.height - height) * flagCropY / 100;
      context.drawImage(image, x, y, width, height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('Could not prepare the cropped banner.')), 'image/webp', 0.9));
      if (currentUserId.current !== userId) return;
      const path = userId + '/kingdom-flag-' + Date.now() + '.webp';
      const { error: uploadError } = await supabase.storage.from('lumen-avatars').upload(path, blob, { contentType: 'image/webp', upsert: true, cacheControl: '3600' });
      if (uploadError) throw uploadError;
      if (currentUserId.current !== userId) { await supabase.storage.from('lumen-avatars').remove([path]); return; }
      const url = supabase.storage.from('lumen-avatars').getPublicUrl(path).data.publicUrl;
      const { data, error: updateError } = await supabase.from('profiles').update({ kingdom_flag_url: url }).eq('id', userId).select('*').single();
      if (updateError) throw updateError;
      onSaved(data as Profile); setKingdomFlagPreview(url); setNotice('Cropped 16:9 kingdom banner saved and synced to the Atlas hover card and Player Profile.');
      setPendingFlagFile(null); if (pendingFlagUrl) URL.revokeObjectURL(pendingFlagUrl); setPendingFlagUrl('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not upload your kingdom flag.');
    } finally { setFlagBusy(false); }
  }

  async function removeKingdomFlag() {
    if (!supabase) return;
    setFlagBusy(true); setError('');
    try {
      const { data, error: updateError } = await supabase.from('profiles').update({ kingdom_flag_url: null }).eq('id', userId).select('*').single();
      if (updateError) throw updateError;
      onSaved(data as Profile); setKingdomFlagPreview(''); setNotice('Kingdom flag removed.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not remove your kingdom flag.'); }
    finally { setFlagBusy(false); }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!supabase) { setError('Supabase is not configured.'); return; }
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
      setError('Username must be 3–24 characters: letters, numbers or underscores.');
      return;
    }
    if (!name.trim() || !school.trim()) {
      setError('Name and school are required.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      let avatarUrl = profile?.avatar_url ?? null;
      if (avatarFile) {
        const blob = await compressAvatar(avatarFile);
        if (currentUserId.current !== userId) return;
        const path = userId + '/avatar-' + Date.now() + '.webp';
        const { error: uploadError } = await supabase.storage.from('lumen-avatars').upload(path, blob, {
          contentType: 'image/webp',
          upsert: true,
          cacheControl: '3600',
        });
        if (uploadError) throw uploadError;
        // If the account changed while the network upload was in flight, remove
        // the now-unreferenced object instead of leaving an orphaned avatar.
        if (currentUserId.current !== userId) {
          await supabase.storage.from('lumen-avatars').remove([path]);
          return;
        }
        avatarUrl = supabase.storage.from('lumen-avatars').getPublicUrl(path).data.publicUrl;
      }
      if (currentUserId.current !== userId) return;
      const { data, error: updateError } = await supabase.from('profiles').update({
        full_name: name.trim(),
        username: username.toLowerCase(),
        class_grade: '12',
        stream: 'PCM',
        school_target: school.trim(),
        avatar_url: avatarUrl,
      }).eq('id', userId).select('*').single();
      if (updateError) throw updateError;
      if (currentUserId.current !== userId) return;
      onSaved(data as Profile);
      setAvatarFile(null);
      setNotice('Profile settings saved.');
    } catch (reason) {
      if (currentUserId.current === userId) setError(reason instanceof Error ? reason.message : 'Could not save settings.');
    } finally {
      if (currentUserId.current === userId) setBusy(false);
    }
  }

  return <section className="panel settings-panel">
    <div className="section-heading">
      <div><span className="eyebrow">ACCOUNT · PERSONALIZATION</span><h2>Your settings</h2></div>
      <span className="settings-secure"><ShieldCheck size={14}/> PRIVATE PROFILE</span>
    </div>
    <p className="settings-intro">Keep your profile current. Changes are saved to your signed-in account.</p>
    <form className="settings-form" onSubmit={save}>
      <div className="settings-avatar-row">
        <div className="settings-avatar">{avatarPreview ? <img src={avatarPreview} alt="Profile preview" /> : <UserRound size={27}/>}</div>
        <div className="settings-avatar-copy"><b>Profile picture</b><span>Images are resized to at most 1200px and compressed to WebP.</span><label className="settings-upload"><Upload size={14}/> Choose image<input type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={chooseAvatar}/></label></div>
      </div>
      <div className="settings-fields">
        <label>Full name<input value={name} onChange={e => setName(e.target.value)} maxLength={80} required autoComplete="name"/></label>
        <label>Username<input value={username} onChange={e => setUsername(e.target.value)} minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" required autoComplete="username"/><small>3–24 letters, numbers or underscores</small></label>
        <label>School / target institution<input value={school} onChange={e => setSchool(e.target.value)} maxLength={120} required/></label>
      </div>
      {error && <div className="settings-error" role="alert">{error}</div>}
      <div className="settings-actions"><span>Changes apply after a successful save.</span><button className="primary-btn" disabled={busy}><Save size={15}/>{busy ? 'Saving settings…' : 'Save settings'}</button></div>
    </form>
    <section className="kingdom-flag-settings">
      <div className="kingdom-flag-preview">{kingdomFlagPreview ? <img src={kingdomFlagPreview} alt="Kingdom flag preview"/> : <Flag size={26}/>}</div>
      <div className="kingdom-flag-copy"><span className="eyebrow">CONQUEST ATLAS · KINGDOM IDENTITY</span><h3>Your kingdom flag</h3><p>Upload a banner for your kingdom. It appears on territory hover cards and in Kingdom Rankings. Wide images work best.</p><div className="kingdom-flag-actions"><label className="settings-upload"><Upload size={14}/>{kingdomFlagPreview?'Change flag':'Upload flag'}<input type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={chooseKingdomFlag} disabled={flagBusy}/></label>{kingdomFlagPreview&&<button type="button" className="cursor-action" onClick={()=>void removeKingdomFlag()} disabled={flagBusy}>Remove flag</button>}</div></div>
    </section>
    
    {pendingFlagFile && pendingFlagUrl && <div className="kingdom-crop-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!flagBusy){setPendingFlagFile(null);URL.revokeObjectURL(pendingFlagUrl);setPendingFlagUrl('');}}}><section className="kingdom-crop-modal" role="dialog" aria-modal="true" aria-label="Crop kingdom banner"><header><div><span className="eyebrow">KINGDOM IDENTITY · IMAGE STUDIO</span><h3>Crop your banner</h3><p>16:9 wide banner · exactly what you see here is saved.</p></div><button type="button" onClick={()=>{setPendingFlagFile(null);URL.revokeObjectURL(pendingFlagUrl);setPendingFlagUrl('');}} disabled={flagBusy} aria-label="Cancel crop">×</button></header><div className="kingdom-crop-stage"><img src={pendingFlagUrl} alt="Banner crop preview" style={{width:(Math.max(100,100*flagCropZoom))+'%',height:'auto',maxWidth:'none',maxHeight:'none',left:'50%',top:'50%',transform:`translate(calc(-50% + ${flagCropX*.45}%),calc(-50% + ${flagCropY*.45}%))`}}/><span>16:9 PREVIEW</span></div><label className="kingdom-crop-control">Zoom <b>{flagCropZoom.toFixed(1)}×</b><input type="range" min="1" max="2.5" step=".1" value={flagCropZoom} onChange={e=>setFlagCropZoom(Number(e.target.value))}/></label><label className="kingdom-crop-control">Horizontal position <b>{flagCropX}</b><input type="range" min="-100" max="100" value={flagCropX} onChange={e=>setFlagCropX(Number(e.target.value))}/></label><label className="kingdom-crop-control">Vertical position <b>{flagCropY}</b><input type="range" min="-100" max="100" value={flagCropY} onChange={e=>setFlagCropY(Number(e.target.value))}/></label><footer><button type="button" className="cursor-action" disabled={flagBusy} onClick={()=>{setPendingFlagFile(null);URL.revokeObjectURL(pendingFlagUrl);setPendingFlagUrl('');}}>Cancel</button><button type="button" className="primary-btn" disabled={flagBusy} onClick={()=>void saveKingdomFlag()}><Upload size={15}/>{flagBusy?'Saving cropped banner…':'Save cropped banner'}</button></footer></section></div>}
    <section className="cursor-size-settings" style={{ marginTop: 22, padding: 18, border: '1px solid rgba(148,163,184,.18)', borderRadius: 16, background: 'linear-gradient(135deg, rgba(30,41,59,.32), rgba(15,23,42,.16))' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <span style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', borderRadius: 12, color: '#93c5fd', background: 'rgba(59,130,246,.14)', border: '1px solid rgba(96,165,250,.24)' }}><MousePointer2 size={20}/></span>
        <div style={{ flex: 1 }}><span className="eyebrow">PERSONALIZATION · POINTER</span><h3 style={{ margin: '4px 0 0', fontSize: 16 }}>Cursor size</h3></div>
        <strong style={{ fontSize: 14, color: '#bfdbfe', fontVariantNumeric: 'tabular-nums' }}>{cursorSize} × {cursorSize}px</strong>
      </div>
      <p style={{ margin: '0 0 14px', color: 'var(--muted, #94a3b8)', fontSize: 13, lineHeight: 1.6 }}>Adjust your equipped custom cursor here. The setting applies instantly and is saved on this browser.</p>
      <input aria-label="Cursor size" type="range" min={12} max={48} step={1} value={cursorSize} onChange={event => changeCursorSize(Number(event.target.value))} style={{ display: 'block', width: '100%', accentColor: '#60a5fa', cursor: 'pointer' }}/>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7, color: 'var(--muted, #94a3b8)', fontSize: 11 }}><span>12px · Compact</span><span>48px · Large</span></div>
    </section>
    <button type="button" className="settings-contact-operator" onClick={onContactOperator}><span><MessageSquareText size={19}/></span><span><b>Need a hand? Contact Operator</b><small>Send a private request, track its status, and receive a direct reply.</small></span><ArrowUpRight size={17}/></button>
  </section>;
}
