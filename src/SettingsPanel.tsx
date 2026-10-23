import { useEffect, useRef, useState, type FormEvent, type ChangeEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Save, ShieldCheck, Upload, UserRound, MousePointer2, ShoppingBag, Check, Sparkles, MessageSquareText, ArrowUpRight, Flag } from 'lucide-react';

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
  const [grade, setGrade] = useState(profile?.class_grade ?? '12');
  const [stream, setStream] = useState(profile?.stream ?? 'PCM');
  const [school, setSchool] = useState((profile?.school_target ?? '').split(' · ')[0] ?? '');
  const [targetExam, setTargetExam] = useState((profile?.school_target ?? '').split(' · ').slice(1).join(' · ') || 'JEE');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(profile?.avatar_url ?? '');
  const [kingdomFlagPreview, setKingdomFlagPreview] = useState(profile?.kingdom_flag_url ?? '');
  const [flagBusy, setFlagBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cursorStore,setCursorStore] = useState<{selected_cursor_id:number;owned_cursor_ids:number[];coins:number;price:number}>({selected_cursor_id:6,owned_cursor_ids:[6],coins:0,price:50000});
  const [cursorBusy,setCursorBusy] = useState<number|null>(null);
  const [cursorSize,setCursorSize] = useState(() => { try { return Math.max(12, Math.min(48, Number(localStorage.getItem('ascend-cursor-size') || 23))); } catch { return 23; } });
  const [cursorSizeSaved,setCursorSizeSaved] = useState(false);
  const [cursorError,setCursorError] = useState('');
  const cursorUrl = (id:number) => id===0
    ? 'https://raw.githubusercontent.com/astryxleo/Ascend-OS/main/cursor/cursor.png'
    : id===21
      ? 'https://raw.githubusercontent.com/astryxleo/Ascend-OS/main/cursor/cursor(21).png'
      : 'https://raw.githubusercontent.com/astryxleo/Ascend-OS/main/cursor/cursor%20('+id+').png';
  function applyAccountCursor(id:number, size?:number) {
    const nextSize = Math.max(12, Math.min(48, Number(size ?? cursorSize)));
    try { localStorage.setItem('ascend-cursor-id', String(id)); } catch {}
    window.dispatchEvent(new CustomEvent('ascend-cursor-settings-change', { detail: { id, size: nextSize } }));
  }
  function saveCursorSize() {
    const size = Math.max(12, Math.min(48, Number(cursorSize)));
    try { localStorage.setItem('ascend-cursor-size', String(size)); } catch {}
    applyAccountCursor(cursorStore.selected_cursor_id, size);
    setCursorSizeSaved(true);
    setNotice('Cursor size saved: ' + size + ' x ' + size + ' px');
  }
  async function loadCursorStore(){ if(!supabase)return; const {data,error}=await supabase.rpc('get_ascend_cursor_store'); if(error){setCursorError(error.message);return;} if(data){setCursorStore(data as typeof cursorStore);applyAccountCursor(Number((data as {selected_cursor_id?:number}).selected_cursor_id??6));} }
  useEffect(()=>{void loadCursorStore();},[userId,supabase]);
  async function unlockCursor(id:number){ if(!supabase)return; setCursorBusy(id);setCursorError('');try{const {data,error}=await supabase.rpc('purchase_ascend_cursor',{p_cursor_id:id});if(error)throw error;if(data){setCursorStore(data as typeof cursorStore);applyAccountCursor(Number((data as {selected_cursor_id?:number}).selected_cursor_id??id));}setNotice('Cursor unlocked and equipped!');}catch(e){setCursorError(e instanceof Error?e.message:'Could not unlock cursor.');}finally{setCursorBusy(null);} }
  async function equipCursor(id:number){ if(!supabase)return;setCursorBusy(id);setCursorError('');try{const {data,error}=await supabase.rpc('select_ascend_cursor',{p_cursor_id:id});if(error)throw error;if(data){setCursorStore(data as typeof cursorStore);applyAccountCursor(Number((data as {selected_cursor_id?:number}).selected_cursor_id??id));}setNotice('Cursor selection saved to your account.');}catch(e){setCursorError(e instanceof Error?e.message:'Could not equip cursor.');}finally{setCursorBusy(null);} }
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
    setGrade(profile?.class_grade ?? '12');
    setStream(profile?.stream ?? 'PCM');
    setSchool((profile?.school_target ?? '').split(' · ')[0] ?? '');
    setTargetExam((profile?.school_target ?? '').split(' · ').slice(1).join(' · ') || 'JEE');
    setAvatarFile(null);
    setAvatarPreview(profile?.avatar_url ?? '');
    setKingdomFlagPreview(profile?.kingdom_flag_url ?? '');
    setError('');
    setBusy(false);
  }, [userId, profile?.full_name, profile?.username, profile?.class_grade, profile?.stream, profile?.school_target, profile?.avatar_url, profile?.kingdom_flag_url]);

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

  async function saveKingdomFlag(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Choose an image file for your kingdom flag.'); return; }
    if (!supabase) { setError('Supabase is not configured.'); return; }
    setFlagBusy(true); setError('');
    try {
      const blob = await compressAvatar(file);
      if (currentUserId.current !== userId) return;
      const path = userId + '/kingdom-flag-' + Date.now() + '.webp';
      const { error: uploadError } = await supabase.storage.from('lumen-avatars').upload(path, blob, { contentType: 'image/webp', upsert: true, cacheControl: '3600' });
      if (uploadError) throw uploadError;
      if (currentUserId.current !== userId) { await supabase.storage.from('lumen-avatars').remove([path]); return; }
      const url = supabase.storage.from('lumen-avatars').getPublicUrl(path).data.publicUrl;
      const { data, error: updateError } = await supabase.from('profiles').update({ kingdom_flag_url: url }).eq('id', userId).select('*').single();
      if (updateError) throw updateError;
      onSaved(data as Profile); setKingdomFlagPreview(url); setNotice('Kingdom flag uploaded! It will appear on your kingdom hover card and rankings.');
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
      setError('Name and school / target institution are required.');
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
        class_grade: grade,
        stream,
        school_target: school.trim() + ' · ' + targetExam,
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
        <label>Class<select value={grade} onChange={e => setGrade(e.target.value)}><option value="11">Class XI</option><option value="12">Class XII</option><option value="Other">Other</option></select></label>
        <label>Stream<select value={stream} onChange={e => setStream(e.target.value)}><option>PCM</option><option>PCB</option><option>Commerce</option><option>Humanities</option><option>Other</option></select></label>
        <label>School / target institution<input value={school} onChange={e => setSchool(e.target.value)} maxLength={120} required/></label>
        <label>Target exam<select value={targetExam} onChange={e => setTargetExam(e.target.value)}><option>JEE</option><option>NEET</option><option>CUET</option><option>Board Exams</option><option>Other</option></select></label>
      </div>
      {error && <div className="settings-error" role="alert">{error}</div>}
      <div className="settings-actions"><span>Changes apply after a successful save.</span><button className="primary-btn" disabled={busy}><Save size={15}/>{busy ? 'Saving settings…' : 'Save settings'}</button></div>
    </form>
    <section className="kingdom-flag-settings">
      <div className="kingdom-flag-preview">{kingdomFlagPreview ? <img src={kingdomFlagPreview} alt="Kingdom flag preview"/> : <Flag size={26}/>}</div>
      <div className="kingdom-flag-copy"><span className="eyebrow">CONQUEST ATLAS · KINGDOM IDENTITY</span><h3>Your kingdom flag</h3><p>Upload a banner for your kingdom. It appears on territory hover cards and in Kingdom Rankings. Wide images work best.</p><div className="kingdom-flag-actions"><label className="settings-upload"><Upload size={14}/>{flagBusy?'Saving flag…':kingdomFlagPreview?'Change flag':'Upload flag'}<input type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={event=>void saveKingdomFlag(event)} disabled={flagBusy}/></label>{kingdomFlagPreview&&<button type="button" className="cursor-action" onClick={()=>void removeKingdomFlag()} disabled={flagBusy}>Remove flag</button>}</div></div>
    </section>
    <section className="cursor-market">
      <div className="cursor-market-head"><div><span className="eyebrow"><MousePointer2 size={13}/> ASCEND CUSTOMIZATION</span><h2>Cursor armory</h2><p>One signature cursor across your entire Ascend workspace. Purchases stay on your account.</p></div><div className="cursor-balance"><span>YOUR BALANCE</span><b>◈ {cursorStore.coins.toLocaleString()}</b><small>50,000 ◈ per cursor</small></div></div>
      <div className="cursor-showcase"><div className="cursor-showcase-preview"><span>LIVE PREVIEW</span><div className="cursor-orbit"><img src={cursorUrl(cursorStore.selected_cursor_id)} alt="Selected cursor preview" style={{width:cursorSize,height:cursorSize,objectFit:"contain"}}/></div><b>{cursorSize} x {cursorSize} px</b><small>Choose a size below, then save to apply it across Ascend.</small></div><div className="cursor-equipped"><span>NOW EQUIPPED</span><b>{cursorStore.selected_cursor_id===6?'ASCEND CLASSIC':`CURSOR ${cursorStore.selected_cursor_id===0?6:cursorStore.selected_cursor_id}`}</b><small>{cursorStore.selected_cursor_id===6?'Default · always free':'Owned · saved to your profile'}</small></div></div>
      <div className="cursor-size-control">
        <div className="cursor-size-heading"><div><b>Cursor size</b><small>Personalize the pointer across your workspace</small></div><strong>{cursorSize} x {cursorSize} px</strong></div>
        <input aria-label="Cursor size in pixels" type="range" min="12" max="48" step="1" value={cursorSize} onChange={e=>{setCursorSize(Number(e.target.value));setCursorSizeSaved(false);}} />
        <div className="cursor-size-scale"><span>12 px · Compact</span><span>48 px · Large</span></div>
        <button type="button" className="cursor-action buy" onClick={saveCursorSize}><Save size={13}/>{cursorSizeSaved?"Size saved":"Save cursor size"}</button>
      </div>
      {cursorError&&<div className="settings-error" role="alert">{cursorError}</div>}
      <div className="cursor-grid">{[6,1,2,3,4,5,0,...Array.from({length:14},(_,i)=>i+7)].map(id=><article key={id} className={`cursor-item ${cursorStore.selected_cursor_id===id?'is-equipped':''}`}>
        <div className="cursor-preview-stage"><span>PREVIEW</span><div className="cursor-art"><img src={cursorUrl(id)} alt={id===6?"Ascend Classic cursor preview":`Cursor ${id===0?6:id} preview`} style={{width:cursorSize,height:cursorSize,objectFit:"contain"}}/></div><small>{id===6?'ASCEND CLASSIC':`CURSOR ${id===0?6:id}`}</small></div>
        <div className="cursor-item-info"><div><b>{id===6?'Ascend Classic':`Cursor ${id===0?6:id}`}</b><span>{id===6?'Included forever':cursorStore.owned_cursor_ids.includes(id)?'In your collection':'Legendary drop'}</span></div>{cursorStore.selected_cursor_id===id?<span className="cursor-state"><Check size={13}/> EQUIPPED</span>:cursorStore.owned_cursor_ids.includes(id)?<button className="cursor-action" disabled={cursorBusy!==null} onClick={()=>void equipCursor(id)}>Equip</button>:<button className="cursor-action buy" disabled={cursorBusy!==null||cursorStore.coins<50000} onClick={()=>void unlockCursor(id)}>{cursorBusy===id?'Unlocking…':<><ShoppingBag size={13}/> 50,000 ◈</>}</button>}</div>
      </article>)}</div>
      <div className="cursor-market-foot"><Sparkles size={15}/><span>Ascend Classic is your free default and appears first. The original pointer is now displayed as Cursor 6; all other paid cursors cost exactly 50,000 Ascend Coins.</span></div>
    </section>
    <button type="button" className="settings-contact-operator" onClick={onContactOperator}><span><MessageSquareText size={19}/></span><span><b>Need a hand? Contact Operator</b><small>Send a private request, track its status, and receive a direct reply.</small></span><ArrowUpRight size={17}/></button>
  </section>;
}
