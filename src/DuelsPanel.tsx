import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Swords, RefreshCw, Clock3, Trophy, ShieldCheck, Send, Check, X, Users } from 'lucide-react';

type Duel = {
  id: string; challenger_id: string; opponent_id: string; goal_minutes: number;
  status: 'pending'|'active'|'completed'|'declined'|'cancelled';
  starts_at: string|null; ends_at: string|null; challenger_minutes: number;
  opponent_minutes: number; winner_id: string|null; created_at: string;
};
type Person = { id: string; username: string|null; full_name: string|null; avatar_url: string|null };
type Props = { supabase: SupabaseClient|null; userId: string; setNotice: (message: string) => void };

export default function DuelsPanel({supabase,userId,setNotice}:Props) {
  const [duels,setDuels] = useState<Duel[]>([]);
  const [people,setPeople] = useState<Record<string,Person>>({});
  const [username,setUsername] = useState('');
  const [goal,setGoal] = useState('120');
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState<string|null>(null);
  const [error,setError] = useState('');

  const load = useCallback(async (quiet=false) => {
    if (!supabase) { setError('Supabase is not configured.'); setLoading(false); return; }
    if (!quiet) setLoading(true);
    setError('');
    const {data,error:loadError} = await supabase.from('study_duels').select('*').order('created_at',{ascending:false}).limit(100);
    if (loadError) { setError(loadError.message); setLoading(false); return; }
    const rows = (data??[]) as Duel[];
    setDuels(rows);
    const ids = [...new Set(rows.flatMap(d=>[d.challenger_id,d.opponent_id]))];
    if (ids.length) {
      const {data:profiles} = await supabase.from('profiles').select('id,username,full_name,avatar_url').in('id',ids);
      setPeople(Object.fromEntries(((profiles??[]) as Person[]).map(p=>[p.id,p])));
    } else setPeople({});
    setLoading(false);
  },[supabase]);

  useEffect(()=>{ void load(); },[load]);
  useEffect(()=>{
    if (!supabase) return;
    const channel=supabase.channel('study-duels-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'study_duels'},()=>{void load(true);})
      .subscribe();
    return()=>{void supabase.removeChannel(channel);};
  },[supabase,load]);

  async function createDuel(e:FormEvent) {
    e.preventDefault();
    if (!supabase || busy) return;
    setBusy('create');
    const {error:rpcError}=await supabase.rpc('create_study_duel',{p_opponent_username:username.trim().replace(/^@/,''),p_goal_minutes:Number(goal)});
    setBusy(null);
    if (rpcError) { setNotice('Could not send challenge: '+rpcError.message); return; }
    setUsername(''); setNotice('Study duel invitation sent.'); await load(true);
  }
  async function respond(duel:Duel,accept:boolean) {
    if (!supabase) return;
    setBusy(duel.id);
    const {error:rpcError}=await supabase.rpc('respond_study_duel',{p_duel_id:duel.id,p_accept:accept});
    if (!rpcError && accept) {
      const {error:refreshError}=await supabase.rpc('refresh_study_duel',{p_duel_id:duel.id});
      if (refreshError) setNotice('Duel accepted, but progress refresh failed: '+refreshError.message);
    }
    setBusy(null);
    if (rpcError) setNotice(rpcError.message);
    else { setNotice(accept?'Duel accepted. Your 24-hour challenge has started!':'Challenge declined.'); await load(true); }
  }
  async function refreshDuel(duel:Duel) {
    if (!supabase) return;
    setBusy(duel.id);
    const {error:rpcError}=await supabase.rpc('refresh_study_duel',{p_duel_id:duel.id});
    setBusy(null);
    if (rpcError) setNotice('Could not refresh duel: '+rpcError.message);
    await load(true);
  }
  const name=(id:string)=>people[id]?.full_name||people[id]?.username||'Student';
  const remaining=(end:string|null)=>end?Math.max(0,Math.ceil((new Date(end).getTime()-Date.now())/3600000)):24;
  const format=(minutes:number)=>{const h=Math.floor(minutes/60);const m=minutes%60;return h? h+'h '+m+'m':m+'m';};

  return <section className="panel duels-panel">
    <div className="section-heading"><div><span className="eyebrow">HEAD-TO-HEAD · 24-HOUR STUDY SPRINT</span><h2>Study duels</h2></div><button className="leaderboard-refresh" onClick={()=>void load()} disabled={loading}><RefreshCw size={14}/>{loading?'Updating':'Refresh'}</button></div>
    <p className="duels-intro">Challenge a classmate to a fair, time-boxed focus sprint. Progress is calculated from saved focus sessions—not manual claims.</p>
    <form className="duel-create" onSubmit={createDuel}>
      <label>STUDENT USERNAME<input value={username} onChange={e=>setUsername(e.target.value)} placeholder="@classmate" required minLength={2} maxLength={40}/></label>
      <label>STUDY GOAL<select value={goal} onChange={e=>setGoal(e.target.value)}><option value="60">1 hour</option><option value="120">2 hours</option><option value="180">3 hours</option><option value="240">4 hours</option><option value="360">6 hours</option><option value="600">10 hours</option></select></label>
      <button className="primary-btn" type="submit" disabled={busy==='create'}><Send size={15}/>{busy==='create'?'Sending…':'Challenge'}</button>
    </form>
    {error&&<div className="duel-error" role="alert"><span>{error}</span><button onClick={()=>void load()}>Try again</button></div>}
    {loading?<div className="duel-empty"><span className="leaderboard-loader"/><b>Loading your challenges…</b></div>:
      !error&&duels.length===0?<div className="duel-empty"><div className="leaderboard-empty-icon"><Users size={22}/></div><b>Your arena is quiet—for now.</b><span>Send a challenge to start the first study duel.</span></div>:
      <div className="duel-list">{duels.map(duel=>{
        const incoming=duel.opponent_id===userId;
        const mine=incoming?duel.opponent_minutes:duel.challenger_minutes;
        const isWinner=duel.winner_id===userId;
        const status=duel.status==='pending'?'Awaiting response':duel.status==='active'?'Live sprint':duel.status==='completed'?(duel.winner_id===null?'Draw':isWinner?'Victory':'Completed'):(duel.status==='declined'?'Declined':'Cancelled');
        const progress=Math.min(100,Math.round(mine/duel.goal_minutes*100));
        return <article className="duel-card" key={duel.id}>
          <div className="duel-card-top"><span className={'duel-status '+duel.status}>{duel.status==='active'&&<span className="duel-live-dot"/>}{status}</span><span className="duel-goal"><TargetIcon/> {format(duel.goal_minutes)} goal</span></div>
          <div className="duel-matchup"><div className="duel-person"><div className="duel-avatar">{people[duel.challenger_id]?.avatar_url?<img src={people[duel.challenger_id].avatar_url!} alt=""/>:name(duel.challenger_id).slice(0,1).toUpperCase()}</div><b>{name(duel.challenger_id)}{duel.challenger_id===userId?' · YOU':''}</b><span>{format(duel.challenger_minutes)}</span></div><div className="duel-versus"><Swords size={20}/><span>VS</span></div><div className="duel-person"><div className="duel-avatar">{people[duel.opponent_id]?.avatar_url?<img src={people[duel.opponent_id].avatar_url!} alt=""/>:name(duel.opponent_id).slice(0,1).toUpperCase()}</div><b>{name(duel.opponent_id)}{duel.opponent_id===userId?' · YOU':''}</b><span>{format(duel.opponent_minutes)}</span></div></div>
          {duel.status==='active'&&<><div className="duel-progress-label"><span>Your focus time</span><b>{progress}% of goal</b></div><div className="progress-track"><div style={{width:progress+'%'}}/></div><div className="duel-time-left"><Clock3 size={13}/>{remaining(duel.ends_at)} hours remaining</div></>}
          {duel.status==='completed'&&<div className="duel-result"><Trophy size={15}/>{duel.winner_id===null?'A tie—great effort from both!':isWinner?'You won this duel!':name(duel.winner_id)+' won this duel.'}</div>}
          {duel.status==='pending'&&incoming&&<div className="duel-actions"><button className="primary-btn" onClick={()=>void respond(duel,true)} disabled={busy===duel.id}><Check size={14}/>Accept</button><button className="duel-decline" onClick={()=>void respond(duel,false)} disabled={busy===duel.id}><X size={14}/>Decline</button></div>}
          {duel.status==='active'&&<button className="duel-refresh-progress" onClick={()=>void refreshDuel(duel)} disabled={busy===duel.id}><RefreshCw size={13}/>{busy===duel.id?'Updating…':'Refresh progress'}</button>}
        </article>;
      })}</div>}
    <div className="leaderboard-footnote"><ShieldCheck size={13}/><span>Only duel participants can read their challenge records. Completed focus sessions determine the result.</span></div>
  </section>;
}

function TargetIcon(){return <Clock3 size={13}/>;}
