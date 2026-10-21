import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ChartNoAxesColumn, Clock3, Flame, RefreshCw, Target, TrendingUp } from 'lucide-react';

type FocusRow={id:string;duration_minutes:number;ended_at:string;subject:string|null;completed:boolean|null};
type Props={supabase:SupabaseClient|null;userId:string};
type DayStat={key:string,label:string,minutes:number};
const istDay=(value:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
const startOfISTDay=(key:string)=>new Date(key+'T00:00:00+05:30');
const minsLabel=(minutes:number)=>minutes>=60?Math.floor(minutes/60)+'h '+minutes%60+'m':minutes+'m';
export default function AnalyticsPanel({supabase,userId}:Props){
 const [rows,setRows]=useState<FocusRow[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [goal,setGoal]=useState(120);
 const load=useCallback(async()=>{
  if(!supabase||!userId){setError('Sign in to see your analytics.');setLoading(false);return;}
  setLoading(true);setError('');
  const {data,error:queryError}=await supabase.from('focus_sessions').select('id,duration_minutes,ended_at,subject,completed').eq('user_id',userId).eq('completed',true).order('ended_at',{ascending:false}).limit(3000);
  if(queryError){setError(queryError.message);setLoading(false);return;}
  setRows((data??[]) as FocusRow[]);setLoading(false);
 },[supabase,userId]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{if(!supabase||!userId)return;const channel=supabase.channel('analytics-focus-'+userId).on('postgres_changes',{event:'*',schema:'public',table:'focus_sessions',filter:'user_id=eq.'+userId},()=>void load()).subscribe();return()=>{void supabase.removeChannel(channel);};},[supabase,userId,load]);
 const days=useMemo<DayStat[]>(()=>{const today=istDay(new Date());const base=startOfISTDay(today);return Array.from({length:7},(_,i)=>{const d=new Date(base.getTime()-(6-i)*86400000);const key=istDay(d);return {key,label:new Intl.DateTimeFormat('en',{timeZone:'Asia/Kolkata',weekday:'short'}).format(d),minutes:rows.filter(r=>istDay(new Date(r.ended_at))===key).reduce((sum,r)=>sum+Math.max(0,r.duration_minutes||0),0)};});},[rows]);
 const today=days[6]?.minutes??0;
 const week=days.reduce((s,d)=>s+d.minutes,0);
 const activeDays=days.filter(d=>d.minutes>0).length;
 const subjects=useMemo(()=>{const map=new Map<string,number>();for(const r of rows){if(!r.ended_at||!days.some(d=>d.key===istDay(new Date(r.ended_at))))continue;const name=r.subject?.trim()||'Unspecified';map.set(name,(map.get(name)||0)+Math.max(0,r.duration_minutes||0));}return [...map.entries()].map(([name,minutes])=>({name,minutes})).sort((a,b)=>b.minutes-a.minutes);},[rows,days]);
 const streak=useMemo(()=>{const studyDays=new Set(rows.map(r=>istDay(new Date(r.ended_at))));let cursor=startOfISTDay(istDay(new Date()));if(!studyDays.has(istDay(cursor)))cursor=new Date(cursor.getTime()-86400000);let n=0;for(let i=0;i<370;i++){const key=istDay(cursor);if(!studyDays.has(key))break;n++;cursor=new Date(cursor.getTime()-86400000);}return n;},[rows]);
 const maxBar=Math.max(goal,...days.map(d=>d.minutes),1);
 return <section className="panel analytics-panel">
  <div className="section-heading"><div><span className="eyebrow">YOUR DATA · YOUR MOMENTUM</span><h2>Study analytics</h2></div><button className="leaderboard-refresh" onClick={()=>void load()} disabled={loading}><RefreshCw size={14}/>{loading?'Updating':'Refresh'}</button></div>
  <p className="analytics-intro">A real view of your completed focus sessions, grouped by Indian Standard Time. No sample graph data.</p>
  {error&&<div className="duel-error" role="alert"><span>{error}</span><button onClick={()=>void load()}>Try again</button></div>}
  <div className="analytics-metrics"><article><span><Clock3 size={15}/> TODAY</span><b>{loading?'—':minsLabel(today)}</b><small>of {minsLabel(goal)} daily goal</small><div className="progress-track"><div style={{width:Math.min(100,today/goal*100)+'%'}}/></div></article><article><span><TrendingUp size={15}/> LAST 7 DAYS</span><b>{loading?'—':minsLabel(week)}</b><small>{activeDays} of 7 days with focus</small></article><article><span><Flame size={15}/> CURRENT STREAK</span><b>{loading?'—':streak+' days'}</b><small>Based on recorded study days</small></article></div>
  <section className="analytics-chart-card"><div className="analytics-card-heading"><div><h3>Weekly focus</h3><p>Completed minutes per day</p></div><label>Daily goal <select value={goal} onChange={e=>setGoal(Number(e.target.value))}><option value={30}>30 min</option><option value={60}>1 hour</option><option value={90}>90 min</option><option value={120}>2 hours</option><option value={180}>3 hours</option><option value={240}>4 hours</option></select></label></div>
   {loading?<div className="analytics-empty">Loading your study history…</div>:!error&&week===0?<div className="analytics-empty"><ChartNoAxesColumn size={23}/><b>Your chart starts with your first completed session.</b><span>Open Focus Room and finish a session to see real progress here.</span></div>:<div className="weekly-bars" role="img" aria-label="Completed focus minutes for the last seven days">{days.map(d=><div className="weekly-bar-column" key={d.key}><span className="weekly-bar-value">{d.minutes?minsLabel(d.minutes):'—'}</span><div className="weekly-bar-track"><div className={'weekly-bar-fill '+(d.key===days[6].key?'today':'')} style={{height:Math.max(d.minutes>0?4:0,d.minutes/maxBar*100)+'%'}}/></div><span className="weekly-bar-label">{d.label}</span><small>{d.key.slice(8)}</small></div>)}</div>}
   <div className="analytics-goal-note"><Target size={15}/><span>{today>=goal?'Daily target reached — great work.':minsLabel(Math.max(0,goal-today))+' left to reach today’s goal.'}</span></div>
  </section>
  <section className="analytics-chart-card"><div className="analytics-card-heading"><div><h3>Subject breakdown</h3><p>Minutes in the last seven days</p></div></div>{loading?<div className="analytics-empty">Calculating subject totals…</div>:subjects.length===0?<div className="analytics-empty">Your subject mix will appear after your first focus session.</div>:<div className="subject-breakdown">{subjects.map(s=><div className="subject-breakdown-row" key={s.name}><div><b>{s.name}</b><span>{minsLabel(s.minutes)}</span></div><div className="progress-track"><div style={{width:Math.min(100,s.minutes/Math.max(1,week)*100)+'%'}}/></div><small>{Math.round(s.minutes/Math.max(1,week)*100)}%</small></div>)}</div>}</section>
  <p className="analytics-footnote">Only completed records are counted. Your goal is a planning target, not a restriction on study time.</p>
 </section>;
}
