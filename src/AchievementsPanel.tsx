import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Award, Flame, Clock3, Target, Sparkles, RefreshCw, LockKeyhole, CheckCircle2, Trophy, X } from 'lucide-react';

type FocusRow = { id:string; duration_minutes:number; ended_at:string; xp_earned:number|null; completed:boolean|null; subject:string|null };
type Props = { supabase:SupabaseClient|null; userId:string };
type AchievementRank={user_id:string;username:string;display_name:string;avatar_url:string|null;focus_sessions:number;focus_minutes:number;total_xp:number;rank_position:number};
type Achievement = {id:string;title:string;description:string;icon:'clock'|'flame'|'target'|'spark';unlocked:boolean;progress:number;goal:number;reward:string};
export default function AchievementsPanel({supabase,userId}:Props){
 const [rows,setRows]=useState<FocusRow[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [achievementRanks,setAchievementRanks]=useState<AchievementRank[]>([]);
 const [achievementToast,setAchievementToast]=useState<Achievement|null>(null);
 const previousUnlocked=useRef<Set<string>|null>(null);
 const requestId=useRef(0);
 const loadedUserId=useRef(userId);
 const load=useCallback(async()=>{
  const request=++requestId.current;
  if(loadedUserId.current!==userId){loadedUserId.current=userId;setRows([]);}
  if(!supabase||!userId){setRows([]);setError('Sign in to view achievements.');setLoading(false);return;}
  setLoading(true);setError('');
  try {
   const {data,error:queryError}=await supabase.from('focus_sessions').select('id,duration_minutes,ended_at,xp_earned,completed,subject').eq('user_id',userId).eq('completed',true).order('ended_at',{ascending:false}).limit(2000);
   if(queryError)throw queryError;
   if(request!==requestId.current)return;
   setRows((data??[]) as FocusRow[]);
   const ranking=await supabase.rpc('get_achievement_leaderboard',{p_limit:100});
   setAchievementRanks(ranking.error?[]:(ranking.data??[]) as AchievementRank[]);
  } catch(reason) {
   if(request===requestId.current){setRows([]);setError(reason instanceof Error?reason.message:'Could not load achievements. Check your connection and retry.');}
  } finally {if(request===requestId.current)setLoading(false);}
 },[supabase,userId]);
 useEffect(()=>{void load();return()=>{requestId.current+=1}},[load]);
 useEffect(()=>{if(!supabase||!userId)return;const ch=supabase.channel('achievements-focus-'+userId).on('postgres_changes',{event:'*',schema:'public',table:'focus_sessions',filter:'user_id=eq.'+userId},()=>void load()).subscribe();return()=>{void supabase.removeChannel(ch);};},[supabase,userId,load]);
 const totalMinutes=rows.reduce((s,r)=>s+Math.max(0,r.duration_minutes||0),0);
 const totalXp=rows.reduce((s,r)=>s+Math.max(0,r.xp_earned||0),0);
 const subjects=new Set(rows.map(r=>r.subject).filter(Boolean)).size;
 const dates=[...new Set(rows.map(r=>new Date(r.ended_at).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})))].sort().reverse();
 let streak=0;
 if(dates.length){const now=new Date();const today=new Date(now.toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})+'T00:00:00+05:30');const first=new Date(dates[0]+'T00:00:00+05:30');if((today.getTime()-first.getTime())/86400000<=1){let expected=first.getTime();for(const day of dates){const value=new Date(day+'T00:00:00+05:30').getTime();if(value===expected){streak++;expected-=86400000;}else if(value<expected)break;}}}
 const longestSession=Math.max(0,...rows.map(r=>Math.max(0,r.duration_minutes||0)));
 const families:Array<{key:string;label:string;icon:Achievement['icon'];goal:(step:number)=>number;progress:number;unit:string;reward:string}>= [
  {key:'sessions',label:'Session Vanguard',icon:'target',goal:n=>n,progress:rows.length,unit:'verified focus sessions',reward:'CONSISTENCY'},
  {key:'hours',label:'Hourglass Ascendant',icon:'clock',goal:n=>n*60,progress:totalMinutes,unit:'minutes of completed focus',reward:'DEEP WORK'},
  {key:'xp',label:'XP Architect',icon:'spark',goal:n=>n*100,progress:totalXp,unit:'earned focus XP',reward:'MASTERY'},
  {key:'streak',label:'Streak Sovereign',icon:'flame',goal:n=>n,progress:streak,unit:'consecutive study days',reward:'DISCIPLINE'},
  {key:'marathon',label:'Marathon Protocol',icon:'clock',goal:n=>n*15,progress:longestSession,unit:'minutes in one completed session',reward:'ENDURANCE'},
 ];
 const achievements:Achievement[]=families.flatMap(family=>Array.from({length:30},(_,i)=>{const step=i+1,goal=family.goal(step);return {id:family.key+'-'+String(step).padStart(2,'0'),title:family.label+' '+String(step).padStart(2,'0'),description:'Reach '+goal.toLocaleString('en-IN')+' '+family.unit+'.',icon:family.icon,unlocked:family.progress>=goal,progress:Math.min(family.progress,goal),goal,reward:family.reward};}));
 const unlockedAchievements=achievements.filter(a=>a.unlocked);
 const unlocked=unlockedAchievements.length;
 useEffect(()=>{const current=new Set(unlockedAchievements.map(a=>a.id));if(previousUnlocked.current){const newly=unlockedAchievements.find(a=>!previousUnlocked.current!.has(a.id));if(newly)setAchievementToast(newly);}previousUnlocked.current=current;},[rows.length,totalMinutes,totalXp,streak,longestSession]);
 useEffect(()=>{if(!achievementToast)return;const timer=window.setTimeout(()=>setAchievementToast(null),6500);return()=>window.clearTimeout(timer);},[achievementToast]);
 const myAchievementRank=achievementRanks.find(r=>r.user_id===userId);
 const icon=(kind:Achievement['icon'])=>kind==='clock'?<Clock3 size={20}/>:kind==='flame'?<Flame size={20}/>:kind==='target'?<Target size={20}/>:<Sparkles size={20}/>;
 const fmt=(m:number)=>Math.floor(m/60)+'h '+m%60+'m';
 return <section className="panel achievements-panel">
  <div className="section-heading"><div><span className="eyebrow">PROGRESS · MILESTONES · MASTERY</span><h2>Achievements</h2></div><button className="leaderboard-refresh" onClick={()=>void load()} disabled={loading}><RefreshCw size={14}/>{loading?'Updating':'Refresh'}</button></div>
  <p className="achievements-intro">Earn milestones from completed, server-recorded focus sessions. No manual XP claims or made-up progress.</p>
  {error&&<div className="duel-error" role="alert"><span>{error}</span><button onClick={()=>void load()}>Try again</button></div>}
  {achievementToast&&<div className="achievement-unlock-toast" role="status"><div className="achievement-unlock-gem"><Trophy size={24}/></div><div><span>✦ ACHIEVEMENT UNLOCKED</span><b>{achievementToast.title}</b><small>{achievementToast.description}</small></div><button onClick={()=>setAchievementToast(null)} aria-label="Dismiss achievement"><X size={16}/></button></div>}
  <div className="achievement-summary"><div className="achievement-summary-icon"><Award size={25}/></div><div className="achievement-summary-copy"><span>ACHIEVEMENTS UNLOCKED</span><b>{loading?'—':unlocked+' / '+achievements.length}</b><div className="progress-track"><div style={{width:(unlocked/achievements.length*100)+'%'}}/></div></div><div className="achievement-xp"><span>TOTAL XP</span><b>{loading?'—':totalXp.toLocaleString()}</b></div></div>
  <div className="achievement-stats"><div><Clock3 size={17}/><span>Focus time</span><b>{loading?'—':fmt(totalMinutes)}</b></div><div><Target size={17}/><span>Sessions</span><b>{loading?'—':rows.length}</b></div><div><Flame size={17}/><span>Current streak</span><b>{loading?'—':streak+' days'}</b></div></div>
  {loading?<div className="duel-empty"><span className="leaderboard-loader"/><b>Checking your milestones…</b></div>:!error&&<div className="achievement-grid">{achievements.map(a=><article className={'achievement-card '+(a.unlocked?'unlocked':'locked')} key={a.id}><div className="achievement-card-top"><div className="achievement-icon">{icon(a.icon)}</div>{a.unlocked?<CheckCircle2 size={17} className="achievement-check"/>:<LockKeyhole size={15} className="achievement-lock"/>}</div><span className="achievement-rarity">{a.reward}</span><h3>{a.title}</h3><p>{a.description}</p><div className="achievement-progress-copy"><span>{a.unlocked?'Unlocked':a.id==='deep-work'||a.id==='marathon'?fmt(a.progress)+' / '+fmt(a.goal):a.progress+' / '+a.goal}</span><b>{Math.round(a.progress/a.goal*100)}%</b></div><div className="progress-track"><div style={{width:(a.progress/a.goal*100)+'%'}}/></div></article>)}</div>}
  <section className="achievement-leaderboard"><header><div><span>GLOBAL HALL OF LEGENDS</span><h3>Achievement leaderboard</h3><p>Ranked by verified focus sessions, minutes and earned XP.</p></div><Trophy size={24}/></header>{myAchievementRank&&<div className="achievement-my-rank"><span>YOUR GLOBAL RANK</span><b>#{myAchievementRank.rank_position}</b><small>{myAchievementRank.focus_sessions} sessions · {fmt(myAchievementRank.focus_minutes)} focused</small></div>}<div className="achievement-rank-list">{achievementRanks.slice(0,10).map((r,i)=><article key={r.user_id} className={r.user_id===userId?'is-you':''}><span className="achievement-rank-position">{String(r.rank_position||i+1).padStart(2,'0')}</span><span className="achievement-rank-avatar">{r.avatar_url?<img src={r.avatar_url} alt=""/>:(r.display_name||'P').slice(0,1).toUpperCase()}</span><div><b>{r.display_name}{r.user_id===userId&&<i>YOU</i>}</b><small>@{r.username}</small></div><span className="achievement-rank-stat"><b>{Number(r.focus_sessions||0).toLocaleString('en-IN')}</b><small>sessions</small></span><span className="achievement-rank-stat"><b>{Number(r.total_xp||0).toLocaleString('en-IN')}</b><small>XP</small></span></article>)}{achievementRanks.length===0&&!loading&&<p className="achievement-leaderboard-empty">Leaderboard is warming up. Finish a focus session and refresh.</p>}</div></section>
  <div className="leaderboard-footnote"><LockKeyhole size={13}/><span>Achievements are calculated from your own completed focus records and are not a transferable currency.</span></div>
 </section>;
}
