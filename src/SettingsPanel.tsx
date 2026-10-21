import { useEffect, useState, type FormEvent, type ChangeEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Save, ShieldCheck, Upload, UserRound } from 'lucide-react';

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

  useEffect(() => {
    if (!avatarPreview.startsWith('blob:')) return;
    return () => URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);

  function chooseAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (file && !file.type.startsWith('image/')) {
      setAvatarFile(null);
      event.target.value = '';
      setError('Choose an image file.');
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
        const path = userId + '/avatar-' + Date.now() + '.webp';
        const { error: uploadError } = await supabase.storage.from('lumen-avatars').upload(path, blob, {
          contentType: 'image/webp',
          upsert: true,
          cacheControl: '3600',
        });
        if (uploadError) throw uploadError;
        avatarUrl = supabase.storage.from('lumen-avatars').getPublicUrl(path).data.publicUrl;
      }
      const { data, error: updateError } = await supabase.from('profiles').update({
        full_name: name.trim(),
        username: username.toLowerCase(),
        class_grade: grade,
        stream,
        school_target: school.trim() + ' · ' + targetExam,
        avatar_url: avatarUrl,
      }).eq('id', userId).select('*').single();
      if (updateError) throw updateError;
      onSaved(data as Profile);
      setAvatarFile(null);
      setNotice('Profile settings saved.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save settings.');
    } finally {
      setBusy(false);
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
  </section>;
}
