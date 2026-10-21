import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Award, Flame, Clock3, Target, Sparkles, RefreshCw, LockKeyhole, CheckCircle2 } from 'lucide-react';

type FocusRow = { id:string; duration_minutes:number; ended_at:string; xp_earned:number|null; completed:boolean|null; subject:string|null };
type Props = { supabase:SupabaseClient|null; userId:string };
type Achievement = {id:string;title:string;description:string;icon:'clock'|'flame'|'target'|'spark';unlocked:boolean;progress:number;goal:number;reward:string};
export default function AchievementsPanel({supabase,userId}:Props){
 const [rows,setRows]=useState<FocusRow[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const load=useCallback(async()=>{
  if(!supabase||!userId){setError('Sign in to view achievements.');setLoading(false);return;}
  setLoading(true);setError('');
  const {data,error:queryError}=await supabase.from('focus_sessions').select('id,duration_minutes,ended_at,xp_earned,completed,subject').eq('user_id',userId).eq('completed',true).order('ended_at',{ascending:false}).limit(2000);
  if(queryError){setError(queryError.message);setLoading(false);return;}
  setRows((data??[]) as FocusRow[]);setLoading(false);
 },[supabase,userId]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{if(!supabase||!userId)return;const ch=supabase.channel('achievements-focus-'+userId).on('postgres_changes',{event:'*',schema:'public',table:'focus_sessions',filter:'user_id=eq.'+userId},()=>void load()).subscribe();return()=>{void supabase.removeChannel(ch);};},[supabase,userId,load]);
 const totalMinutes=rows.reduce((s,r)=>s+Math.max(0,r.duration_minutes||0),0);
 const totalXp=rows.reduce((s,r)=>s+Math.max(0,r.xp_earned||0),0);
 const subjects=new Set(rows.map(r=>r.subject).filter(Boolean)).size;
 const dates=[...new Set(rows.map(r=>new Date(r.ended_at).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})))].sort().reverse();
 let streak=0;
 if(dates.length){const now=new Date();const today=new Date(now.toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})+'T00:00:00+05:30');const first=new Date(dates[0]+'T00:00:00+05:30');if((today.getTime()-first.getTime())/86400000<=1){let expected=first.getTime();for(const day of dates){const value=new Date(day+'T00:00:00+05:30').getTime();if(value===expected){streak++;expected-=86400000;}else if(value<expected)break;}}}
 const achievements:Achievement[]=[
  {id:'first-focus',title:'First Focus',description:'Complete your first verified focus session.',icon:'spark',unlocked:rows.length>=1,progress:Math.min(rows.length,1),goal:1,reward:'Starter'},
  {id:'deep-work',title:'Deep Work',description:'Accumulate 5 hours of verified focus.',icon:'clock',unlocked:totalMinutes>=300,progress:Math.min(totalMinutes,300),goal:300,reward:'Focused'},
  {id:'ten-sessions',title:'Consistency',description:'Complete 10 focus sessions.',icon:'target',unlocked:rows.length>=10,progress:Math.min(rows.length,10),goal:10,reward:'Steady'},
  {id:'streak-three',title:'Three-Day Spark',description:'Study on 3 consecutive study days.',icon:'flame',unlocked:streak>=3,progress:Math.min(streak,3),goal:3,reward:'Streak'},
  {id:'marathon',title:'Study Marathon',description:'Accumulate 20 hours of verified focus.',icon:'clock',unlocked:totalMinutes>=1200,progress:Math.min(totalMinutes,1200),goal:1200,reward:'Marathon'},
  {id:'subject-explorer',title:'Subject Explorer',description:'Record focus sessions in 4 different subjects.',icon:'spark',unlocked:subjects>=4,progress:Math.min(subjects,4),goal:4,reward:'Explorer'},
 ];
 const unlocked=achievements.filter(a=>a.unlocked).length;
 const icon=(kind:Achievement['icon'])=>kind==='clock'?<Clock3 size={20}/>:kind==='flame'?<Flame size={20}/>:kind==='target'?<Target size={20}/>:<Sparkles size={20}/>;
 const fmt=(m:number)=>Math.floor(m/60)+'h '+m%60+'m';
 return <section className="panel achievements-panel">
  <div className="section-heading"><div><span className="eyebrow">PROGRESS · MILESTONES · MASTERY</span><h2>Achievements</h2></div><button className="leaderboard-refresh" onClick={()=>void load()} disabled={loading}><RefreshCw size={14}/>{loading?'Updating':'Refresh'}</button></div>
  <p className="achievements-intro">Earn milestones from completed, server-recorded focus sessions. No manual XP claims or made-up progress.</p>
  {error&&<div className="duel-error" role="alert"><span>{error}</span><button onClick={()=>void load()}>Try again</button></div>}
  <div className="achievement-summary"><div className="achievement-summary-icon"><Award size={25}/></div><div className="achievement-summary-copy"><span>ACHIEVEMENTS UNLOCKED</span><b>{loading?'—':unlocked+' / '+achievements.length}</b><div className="progress-track"><div style={{width:(unlocked/achievements.length*100)+'%'}}/></div></div><div className="achievement-xp"><span>TOTAL XP</span><b>{loading?'—':totalXp.toLocaleString()}</b></div></div>
  <div className="achievement-stats"><div><Clock3 size={17}/><span>Focus time</span><b>{loading?'—':fmt(totalMinutes)}</b></div><div><Target size={17}/><span>Sessions</span><b>{loading?'—':rows.length}</b></div><div><Flame size={17}/><span>Current streak</span><b>{loading?'—':streak+' days'}</b></div></div>
  {loading?<div className="duel-empty"><span className="leaderboard-loader"/><b>Checking your milestones…</b></div>:!error&&<div className="achievement-grid">{achievements.map(a=><article className={'achievement-card '+(a.unlocked?'unlocked':'locked')} key={a.id}><div className="achievement-card-top"><div className="achievement-icon">{icon(a.icon)}</div>{a.unlocked?<CheckCircle2 size={17} className="achievement-check"/>:<LockKeyhole size={15} className="achievement-lock"/>}</div><span className="achievement-rarity">{a.reward}</span><h3>{a.title}</h3><p>{a.description}</p><div className="achievement-progress-copy"><span>{a.unlocked?'Unlocked':a.id==='deep-work'||a.id==='marathon'?fmt(a.progress)+' / '+fmt(a.goal):a.progress+' / '+a.goal}</span><b>{Math.round(a.progress/a.goal*100)}%</b></div><div className="progress-track"><div style={{width:(a.progress/a.goal*100)+'%'}}/></div></article>)}</div>}
  <div className="leaderboard-footnote"><LockKeyhole size={13}/><span>Achievements are calculated from your own completed focus records and are not a transferable currency.</span></div>
 </section>;
}
