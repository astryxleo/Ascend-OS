import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowUpRight, ShieldCheck } from 'lucide-react';

type Props = {
  supabase: SupabaseClient;
  profile: Record<string, any>;
  userId: string;
  onSaved: (profile: any) => void;
};

async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  if (file.size > 12 * 1024 * 1024) throw new Error('Choose an image smaller than 12 MB.');
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const element = new Image();
    element.onload = () => { URL.revokeObjectURL(url); resolve(element); };
    element.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Unable to read that image.')); };
    element.src = url;
  });
  const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image compression is not supported by this browser.');
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not compress image.')), 'image/webp', 0.86));
}

export default function Onboarding({ supabase, profile, userId, onSaved }: Props) {
  const [name, setName] = useState(profile.full_name || '');
  const [username, setUsername] = useState(profile.username || '');
  const [grade, setGrade] = useState(profile.class_grade || '12');
  const [stream, setStream] = useState(profile.stream || 'PCM');
  const [school, setSchool] = useState((profile.school_target || '').split(' · ')[0] || '');
  const [target, setTarget] = useState((profile.school_target || '').split(' · ').slice(1).join(' · ') || 'JEE');
  const [avatar, setAvatar] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const activeUserId = useRef(userId);
  activeUserId.current = userId;

  useEffect(() => {
    setName(profile.full_name || '');
    setUsername(profile.username || '');
    setGrade(profile.class_grade || '12');
    setStream(profile.stream || 'PCM');
    setSchool((profile.school_target || '').split(' · ')[0] || '');
    setTarget((profile.school_target || '').split(' · ').slice(1).join(' · ') || 'JEE');
    setAvatar(null);
    setError('');
    setBusy(false);
  }, [userId, profile.full_name, profile.username, profile.class_grade, profile.stream, profile.school_target, profile.avatar_url]);

  function chooseAvatar(file: File | null) {
    if (file && !file.type.startsWith('image/')) {
      setAvatar(null);
      setError('Choose an image file.');
      return;
    }
    if (file && file.size > 12 * 1024 * 1024) {
      setAvatar(null);
      setError('Choose an image smaller than 12 MB.');
      return;
    }
    setAvatar(file);
    setError('');
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
      setError('Username must be 3–24 characters: letters, numbers or underscores.');
      return;
    }
    if (!name.trim() || !school.trim()) {
      setError('Please complete your name and school / target institution.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      let avatarUrl = profile.avatar_url || null;
      if (avatar) {
        const blob = await compressImage(avatar);
        if (activeUserId.current !== userId) return;
        const path = userId + '/avatar-' + Date.now() + '.webp';
        const { error: uploadError } = await supabase.storage.from('lumen-avatars').upload(path, blob, { contentType: 'image/webp', upsert: true });
        if (uploadError) throw uploadError;
        if (activeUserId.current !== userId) {
          await supabase.storage.from('lumen-avatars').remove([path]);
          return;
        }
        avatarUrl = supabase.storage.from('lumen-avatars').getPublicUrl(path).data.publicUrl;
      }
      if (activeUserId.current !== userId) return;
      const { data, error: updateError } = await supabase.from('profiles')
        .update({ full_name: name.trim(), username: username.toLowerCase(), class_grade: grade, stream, school_target: school.trim() + ' · ' + target, avatar_url: avatarUrl })
        .eq('id', userId).select('*').single();
      if (updateError) throw updateError;
      if (activeUserId.current !== userId) return;
      onSaved(data);
    } catch (reason) {
      if (activeUserId.current === userId) setError(reason instanceof Error ? reason.message : 'Could not save your profile.');
    } finally {
      if (activeUserId.current === userId) setBusy(false);
    }
  }

  return <div className="auth-shell"><div className="auth-ambient ambient-one" /><div className="auth-card onboarding-card">
    <div className="brand auth-brand"><div className="brand-mark">L</div><div><strong>LUMEN</strong><span>STUDY OPERATING SYSTEM</span></div></div>
    <div className="auth-kicker"><span /> PERSONALIZE YOUR WORKSPACE</div>
    <h1>Set your<br /><em>coordinates.</em></h1>
    <p className="auth-copy">A few details help shape your academic command deck.</p>
    <form className="onboarding-form" onSubmit={save}>
      <label className="field-label">FULL NAME<input value={name} onChange={e => setName(e.target.value)} required maxLength={80} placeholder="Your name" /></label>
      <label className="field-label">UNIQUE USERNAME<input value={username} onChange={e => setUsername(e.target.value)} required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" placeholder="your_handle" /></label>
      <div className="onboard-pair">
        <label className="field-label">CLASS<select value={grade} onChange={e => setGrade(e.target.value)}><option value="11">Class XI</option><option value="12">Class XII</option><option value="Other">Other</option></select></label>
        <label className="field-label">STREAM<select value={stream} onChange={e => setStream(e.target.value)}><option>PCM</option><option>PCB</option><option>Commerce</option><option>Humanities</option><option>Other</option></select></label>
      </div>
      <label className="field-label">SCHOOL / TARGET INSTITUTION<input value={school} onChange={e => setSchool(e.target.value)} required maxLength={120} placeholder="School or institution" /></label>
      <label className="field-label">TARGET EXAM<select value={target} onChange={e => setTarget(e.target.value)}><option>JEE</option><option>NEET</option><option>CUET</option><option>Board Exams</option><option>Other</option></select></label>
      <label className="field-label">AVATAR (OPTIONAL)<input type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={e => { chooseAvatar(e.target.files?.[0] || null); e.target.value = ''; }} /></label>
      {error && <div className="auth-message">{error}</div>}
      <button className="auth-submit" disabled={busy}>{busy ? 'Saving profile…' : 'Build my workspace'} <ArrowUpRight size={16} /></button>
    </form>
    <div className="auth-security"><ShieldCheck size={15} /> Your profile is linked to your signed-in account.</div>
  </div></div>;
}
