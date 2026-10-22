import { useEffect, useRef, useState, type FormEvent, type ChangeEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Save, ShieldCheck, Upload, UserRound, MousePointer2, ShoppingBag, Check, Sparkles } from 'lucide-react';

type Profile = {
  full_name?: string | null;
  username?: string | null;
  class_grade?: string | null;
  stream?: string | null;
  school_target?: string | null;
  avatar_url?: string | null;
};

type Props = {
  supabase: SupabaseClient | null;
  profile: Profile | null;
  userId: string;
  onSaved: (profile: Profile) => void;
  setNotice: (message: string) => void;
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

export default function SettingsPanel({ supabase, profile, userId, onSaved, setNotice }: Props) {
  const [name, setName] = useState(profile?.full_name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [grade, setGrade] = useState(profile?.class_grade ?? '12');
  const [stream, setStream] = useState(profile?.stream ?? 'PCM');
  const [school, setSchool] = useState((profile?.school_target ?? '').split(' · ')[0] ?? '');
  const [targetExam, setTargetExam] = useState((profile?.school_target ?? '').split(' · ').slice(1).join(' · ') || 'JEE');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(profile?.avatar_url ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cursorStore,setCursorStore] = useState<{selected_cursor_id:number;owned_cursor_ids:number[];coins:number;price:number}>({selected_cursor_id:6,owned_cursor_ids:[6],coins:0,price:50000});
  const [cursorBusy,setCursorBusy] = useState<number|null>(null);
  const [cursorError,setCursorError] = useState('');
  const cursorUrl = (id:number) => id===0 ? 'https://raw.githubusercontent.com/astryxleo/Ascend-OS/main/cursor/cursor.cur' : 'https://raw.githubusercontent.com/astryxleo/Ascend-OS/main/cursor/cursor%20('+id+').cur';
  function applyAccountCursor(id:number){const src=cursorUrl(id);let style=document.getElementById('ascend-account-cursor') as HTMLStyleElement|null;if(!style){style=document.createElement('style');style.id='ascend-account-cursor';document.head.appendChild(style);}style.textContent='*{cursor:url("'+src+'"), auto !important} a,button,[role="button"],input,select,textarea{cursor:url("'+src+'"), auto !important}';}
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
    setError('');
    setBusy(false);
  }, [userId, profile?.full_name, profile?.username, profile?.class_grade, profile?.stream, profile?.school_target, profile?.avatar_url]);

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
    <section className="cursor-market">
      <div className="cursor-market-head"><div><span className="eyebrow"><MousePointer2 size={13}/> ASCEND CUSTOMIZATION</span><h2>Cursor armory</h2><p>One signature cursor across your entire Ascend workspace. Purchases stay on your account.</p></div><div className="cursor-balance"><span>YOUR BALANCE</span><b>◈ {cursorStore.coins.toLocaleString()}</b><small>50,000 ◈ per cursor</small></div></div>
      <div className="cursor-showcase"><div className="cursor-showcase-preview" style={{cursor:`url("${cursorUrl(cursorStore.selected_cursor_id)}"), auto`}}><span>LIVE PREVIEW</span><div className="cursor-orbit"><MousePointer2 size={35}/></div><b>Move over the cards to preview</b><small>System cursor hotspot is preserved from each .cur file.</small></div><div className="cursor-equipped"><span>NOW EQUIPPED</span><b>CURSOR ({cursorStore.selected_cursor_id===0?'ORIGINAL':cursorStore.selected_cursor_id})</b><small>{cursorStore.selected_cursor_id===6?'Default · always free':'Owned · saved to your profile'}</small></div></div>
      {cursorError&&<div className="settings-error" role="alert">{cursorError}</div>}
      <div className="cursor-grid">{Array.from({length:21},(_,id)=><article key={id} className={`cursor-item ${cursorStore.selected_cursor_id===id?'is-equipped':''}`} style={{cursor:`url("${cursorUrl(id)}"), auto`}}>
        <div className="cursor-preview-stage" style={{cursor:`url("${cursorUrl(id)}"), auto`}}><span>PREVIEW</span><div className="cursor-art" style={{cursor:`url("${cursorUrl(id)}"), auto`}}/><small>{id===0?'ORIGINAL':`CURSOR ${id}`}</small></div>
        <div className="cursor-item-info"><div><b>{id===6?'Ascend Classic':id===0?'Original Pointer':`Cursor ${id}`}</b><span>{id===6?'Included forever':cursorStore.owned_cursor_ids.includes(id)?'In your collection':'Legendary drop'}</span></div>{cursorStore.selected_cursor_id===id?<span className="cursor-state"><Check size={13}/> EQUIPPED</span>:cursorStore.owned_cursor_ids.includes(id)?<button className="cursor-action" disabled={cursorBusy!==null} onClick={()=>void equipCursor(id)}>Equip</button>:<button className="cursor-action buy" disabled={cursorBusy!==null||cursorStore.coins<50000} onClick={()=>void unlockCursor(id)}>{cursorBusy===id?'Unlocking…':<><ShoppingBag size={13}/> 50,000 ◈</>}</button>}</div>
      </article>)}</div>
      <div className="cursor-market-foot"><Sparkles size={15}/><span>All 21 cursor files are available to preview. Cursor 6 is your free default; every other cursor costs exactly 50,000 Ascend Coins.</span></div>
    </section>
  </section>;
}
