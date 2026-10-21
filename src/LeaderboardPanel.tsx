import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BookOpen, Clock3, Crown, Medal, RefreshCw, ShieldCheck, Trophy, Users } from 'lucide-react';

type Entry = {
  rank: number;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  focus_minutes: number;
  completed_steps: number;
  completed_sessions: number;
};

const podium = [
  {label:'01 · FIRST',className:'rank-first',icon:Crown},
  {label:'02 · SECOND',className:'rank-second',icon:Medal},
  {label:'03 · THIRD',className:'rank-third',icon:Medal},
];

function initials(name:string) {
  return name.trim().split(/\s+/).slice(0,2).map(part=>part[0]??'').join('').toUpperCase()||'L';
}

export default function LeaderboardPanel({supabase,userId}:{supabase:SupabaseClient|null;userId:string}) {
  const [entries,setEntries]=useState<Entry[]>([]);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [error,setError]=useState('');
  const [period,setPeriod]=useState<'all'|'focus'|'syllabus'>('all');

  const load=useCallback(async(quiet=false)=>{
    if(!supabase){setError('Connect Supabase to load the leaderboard.');setLoading(false);return;}
    if(quiet)setRefreshing(true);else setLoading(true);
    setError('');
    try{
      const {data,error:rpcError}=await supabase.rpc('get_public_leaderboard',{p_limit:100});
      if(rpcError)throw rpcError;
      setEntries((data??[]) as Entry[]);
    }catch(reason){
      setError(reason instanceof Error?reason.message:'Could not load the leaderboard.');
    }finally{setLoading(false);setRefreshing(false);}
  },[supabase]);

  useEffect(()=>{void load();},[load]);
  useEffect(()=>{
    if(!supabase)return;
    const channel=supabase.channel('lumen-leaderboard-refresh')
      .on('postgres_changes',{event:'*',schema:'public',table:'focus_sessions'},()=>{void load(true);})
      .on('postgres_changes',{event:'*',schema:'public',table:'chapter_progress'},()=>{void load(true);})
      .subscribe();
    return()=>{void supabase.removeChannel(channel);};
  },[supabase,load]);

  const sorted=[...entries].sort((a,b)=>{
    if(period==='focus')return b.focus_minutes-a.focus_minutes||b.completed_steps-a.completed_steps;
    if(period==='syllabus')return b.completed_steps-a.completed_steps||b.focus_minutes-a.focus_minutes;
    return a.rank-b.rank;
  });
  const me=entries.find(entry=>entry.user_id===userId);
  const top=sorted.slice(0,3);

  return <section className="panel leaderboard-panel">
    <div className="section-heading">
      <div><span className="eyebrow">LUMEN RANKINGS · STUDY CONSISTENCY</span><h2>Study leaderboard</h2></div>
      <button className="leaderboard-refresh" onClick={()=>void load(true)} disabled={loading||refreshing} aria-label="Refresh leaderboard"><RefreshCw size={14} className={refreshing?'leaderboard-spin':''}/>{refreshing?'Updating':'Refresh'}</button>
    </div>
    <p className="leaderboard-intro">A transparent ranking of study effort and syllabus progress. Only public study stats are shown.</p>
    {me&&<div className="leaderboard-you">
      <div className="leaderboard-you-icon"><ShieldCheck size={17}/></div>
      <div className="leaderboard-you-copy"><b>Your position</b><span>{me.display_name} · {me.focus_minutes.toLocaleString('en-IN')} focus minutes</span></div>
      <strong>#{me.rank}</strong>
    </div>}
    <div className="leaderboard-filters" role="group" aria-label="Sort leaderboard">
      <button className={period==='all'?'active':''} onClick={()=>setPeriod('all')}>Overall</button>
      <button className={period==='focus'?'active':''} onClick={()=>setPeriod('focus')}>Focus time</button>
      <button className={period==='syllabus'?'active':''} onClick={()=>setPeriod('syllabus')}>Syllabus</button>
    </div>
    {loading?<div className="leaderboard-empty"><span className="leaderboard-loader"/><b>Calculating rankings…</b></div>:
      error?<div className="leaderboard-error" role="alert"><span>{error}</span><button onClick={()=>void load(true)}>Try again</button></div>:
      entries.length===0?<div className="leaderboard-empty"><div className="leaderboard-empty-icon"><Users size={22}/></div><b>The leaderboard is waiting for its first contenders.</b><span>Study sessions and completed checkpoints will appear here when students start learning.</span></div>:
      <>
        <div className="leaderboard-podium">{top.map((entry,index)=>{
          const item=podium[index];const Icon=item.icon;
          return <article className={'leaderboard-podium-card '+item.className} key={entry.user_id}>
            <span className="leaderboard-podium-label">{item.label}</span>
            <div className="leaderboard-avatar">{entry.avatar_url?<img src={entry.avatar_url} alt=""/>:initials(entry.display_name)}</div>
            <Icon size={18}/>
            <b title={entry.display_name}>{entry.display_name}</b>
            <strong>{entry.focus_minutes.toLocaleString('en-IN')} <small>min</small></strong>
            <span className="leaderboard-podium-meta">{entry.completed_steps} checkpoints</span>
          </article>;
        })}</div>
        <div className="leaderboard-table-wrap"><table className="leaderboard-table">
          <thead><tr><th>RANK</th><th>STUDENT</th><th><Clock3 size={12}/> FOCUS MIN</th><th><BookOpen size={12}/> CHECKPOINTS</th><th>SESSIONS</th></tr></thead>
          <tbody>{sorted.map(entry=><tr key={entry.user_id} className={entry.user_id===userId?'leaderboard-current':''}>
            <td><span className={'leaderboard-rank '+(entry.rank<=3?'top-rank':'')}>{String(entry.rank).padStart(2,'0')}</span></td>
            <td><div className="leaderboard-student"><div className="leaderboard-avatar small">{entry.avatar_url?<img src={entry.avatar_url} alt=""/>:initials(entry.display_name)}</div><div><b>{entry.display_name}{entry.user_id===userId?' · YOU':''}</b><span>@{entry.username}</span></div></div></td>
            <td>{entry.focus_minutes.toLocaleString('en-IN')}</td><td>{entry.completed_steps.toLocaleString('en-IN')}</td><td>{entry.completed_sessions.toLocaleString('en-IN')}</td>
          </tr>)}</tbody>
        </table></div>
      </>}
    <div className="leaderboard-footnote"><Trophy size={13}/><span>Rankings are based on saved study activity, not self-reported scores.</span></div>
  </section>;
}
