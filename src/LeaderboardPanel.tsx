import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BookOpen, Clock3, Crown, Coins, Medal, RefreshCw, ShieldCheck, Trophy, Users, Swords, Zap, Flame, ListChecks, ChevronUp, Sparkles } from 'lucide-react';

type UserEntry = {
  user_id:string; username:string; display_name:string; avatar_url:string|null;
  army_quantity:number|string; coins:number|string; cash:number|string; focus_minutes:number|string;
  completed_steps:number|string; completed_sessions:number|string; completed_tasks:number|string;
  combat_level:number|string; combat_rating:number|string; combat_wins:number|string; power_score:number|string; squad_count:number|string;
};
type SquadEntry = {
  squad_id:string; squad_name:string; description:string; member_count:number|string;
  army_quantity:number|string; ascend_power:number|string; ascend_level:number|string;
  focus_minutes:number|string; completed_steps:number|string; coins:number|string;
  squad_power:number|string; created_at:string;
};
type Category='overall'|'army'|'wealth'|'focus'|'power'|'syllabus'|'tasks'|'sessions'|'duels';
type Props={supabase:SupabaseClient|null;userId:string};
const categories:{id:Category;label:string;short:string;icon:typeof Trophy;metric:string;hint:string}[]=[
 {id:'overall',label:'Overall Legends',short:'Overall',icon:Crown,metric:'power_score',hint:'Balanced all-round ranking'},
 {id:'army',label:'Largest Army',short:'Army',icon:Users,metric:'army_quantity',hint:'Most troops commanded'},
 {id:'wealth',label:'Richest Players',short:'Richest',icon:Coins,metric:'coins',hint:'Highest coin balance'},
 {id:'focus',label:'Focus Titans',short:'Focus',icon:Clock3,metric:'focus_minutes',hint:'Lifetime focused minutes'},
 {id:'power',label:'Most Powerful',short:'Power',icon:Zap,metric:'power_score',hint:'Combined combat power score'},
 {id:'syllabus',label:'Syllabus Masters',short:'Syllabus',icon:BookOpen,metric:'completed_steps',hint:'Completed syllabus checkpoints'},
 {id:'tasks',label:'Task Finishers',short:'Tasks',icon:ListChecks,metric:'completed_tasks',hint:'Completed planner tasks'},
 {id:'sessions',label:'Focus Streakers',short:'Sessions',icon:Flame,metric:'completed_sessions',hint:'Completed focus sessions'},
 {id:'duels',label:'Duel Dominators',short:'Duels',icon:Swords,metric:'combat_rating',hint:'Combat rating, with wins as the tie-breaker'},
];
const number=(v:number|string|undefined)=>Number(v??0)||0;
const fmt=(v:number|string|undefined)=>number(v).toLocaleString('en-IN');
const duration=(v:number|string)=>{const n=number(v);const h=Math.floor(n/60);const m=n%60;return h? h+'h '+m+'m':m+'m';};
const initials=(name:string)=>name.trim().split(/\s+/).slice(0,2).map(p=>p[0]??'').join('').toUpperCase()||'A';

export default function LeaderboardPanel({supabase,userId}:Props){
 const [users,setUsers]=useState<UserEntry[]>([]);
 const [playerFlags,setPlayerFlags]=useState<Record<string,string>>({});
 const [squads,setSquads]=useState<SquadEntry[]>([]);
 const [view,setView]=useState<'players'|'squads'>('players');
 const [category,setCategory]=useState<Category>('overall');
 const [loading,setLoading]=useState(true);
 const [refreshing,setRefreshing]=useState(false);
 const [error,setError]=useState('');
 const requestId=useRef(0);
 const load=useCallback(async(quiet=false)=>{
  const request=++requestId.current;
  if(!supabase){setUsers([]);setSquads([]);setError('Connect Supabase to load live rankings.');setLoading(false);setRefreshing(false);return;}
  if(quiet)setRefreshing(true);else setLoading(true);setError('');
  try{
   const [u,s]=await Promise.all([
    supabase.rpc('get_ascend_rankings',{p_limit:100}),
    supabase.rpc('get_squad_rankings',{p_limit:100}),
   ]);
   if(u.error)throw u.error;if(s.error)throw s.error;
   if(request===requestId.current){const nextUsers=(u.data??[]) as UserEntry[];setUsers(nextUsers);setSquads((s.data??[]) as SquadEntry[]);const ids=nextUsers.map(entry=>entry.user_id);if(ids.length){const flags=await supabase.from('profiles').select('id,kingdom_flag_url').in('id',ids);if(!flags.error&&request===requestId.current){const map:Record<string,string>={};for(const row of flags.data??[]){if(row.kingdom_flag_url)map[row.id]=row.kingdom_flag_url;}setPlayerFlags(map);}}}
  }catch(reason){if(request===requestId.current)setError(reason instanceof Error?reason.message:'Could not load live rankings.');}
  finally{if(request===requestId.current){setLoading(false);setRefreshing(false);}}
 },[supabase]);
 useEffect(()=>{void load();return()=>{requestId.current+=1;};},[load]);
 useEffect(()=>{
  if(!supabase)return;
  const channel=supabase.channel('ascend-global-leaderboards')
   .on('postgres_changes',{event:'*',schema:'public',table:'profiles'},()=>void load(true))
   .on('postgres_changes',{event:'*',schema:'public',table:'combat_customizations'},()=>void load(true))
   .on('postgres_changes',{event:'*',schema:'public',table:'combat_fighters'},()=>void load(true))
   .on('postgres_changes',{event:'*',schema:'public',table:'combat_matches'},()=>void load(true))
   .on('postgres_changes',{event:'*',schema:'public',table:'wallets'},()=>void load(true))
   .on('postgres_changes',{event:'*',schema:'public',table:'focus_sessions'},()=>void load(true))
   .on('postgres_changes',{event:'*',schema:'public',table:'chapter_progress'},()=>void load(true))
   .on('postgres_changes',{event:'*',schema:'public',table:'planner_tasks'},()=>void load(true))
   .on('postgres_changes',{event:'*',schema:'public',table:'study_squads'},()=>void load(true))
   .on('postgres_changes',{event:'*',schema:'public',table:'study_squad_members'},()=>void load(true))
   .subscribe();
  return()=>{void supabase.removeChannel(channel);};
 },[supabase,load]);
 const sorted=useMemo(()=>{
  const key=categories.find(c=>c.id===category)?.metric??'power_score';
  return [...users].sort((a,b)=>{
   if(category==='overall')return number(b.power_score)+number(b.focus_minutes)+number(b.completed_steps)*20+number(b.completed_tasks)*10-number(a.power_score)-number(a.focus_minutes)-number(a.completed_steps)*20-number(a.completed_tasks)*10;
   if(category==='wealth')return number(b.coins)+number(b.cash)-number(a.coins)-number(a.cash);
   if(category==='duels')return number(b.combat_rating)-number(a.combat_rating)||number(b.combat_wins)-number(a.combat_wins);
   return number(b[key as keyof UserEntry] as number|string)-number(a[key as keyof UserEntry] as number|string);
  });
 },[users,category]);
 const selected=categories.find(c=>c.id===category)??categories[0];
 const myRank=sorted.findIndex(e=>e.user_id===userId)+1;
 const top=sorted.slice(0,3);
 const podiumEntries:UserEntry[]=top.length>1?[top[1],top[0],top[2]].filter((entry):entry is UserEntry=>Boolean(entry)):top;
 const squadTop=[...squads].sort((a,b)=>number(b.squad_power)-number(a.squad_power)).slice(0,3);
 const displayMetric=(e:UserEntry)=>{
  if(category==='focus')return duration(e.focus_minutes);
  if(category==='army')return fmt(e.army_quantity)+' troops';
  if(category==='wealth')return fmt(number(e.coins)+number(e.cash))+' net worth';
  if(category==='syllabus')return fmt(e.completed_steps)+' checkpoints';
  if(category==='tasks')return fmt(e.completed_tasks)+' tasks';
  if(category==='sessions')return fmt(e.completed_sessions)+' sessions';
  if(category==='duels')return fmt(e.combat_rating)+' rating · '+fmt(e.combat_wins)+' wins';
  if(category==='power')return fmt(e.power_score)+' power';
  return fmt(number(e.power_score)+number(e.focus_minutes)+number(e.completed_steps)*20+number(e.completed_tasks)*10)+' score';
 };
 const squadMetric=(s:SquadEntry)=>view==='squads'?fmt(s.squad_power)+' power':'';
 return <section className="panel leaderboard-panel ascend-rankings">
  <div className="section-heading">
   <div><span className="eyebrow">ASCEND COMPETITIVE INTELLIGENCE</span><h2>Hall of Legends</h2></div>
   <button className="leaderboard-refresh" onClick={()=>void load(true)} disabled={loading||refreshing} aria-label="Refresh all rankings"><RefreshCw size={14} className={refreshing?'leaderboard-spin':''}/>{refreshing?'Syncing':'Refresh'}</button>
  </div>
  <p className="leaderboard-intro">Every grind counts. Track the strongest armies, biggest wallets, focus monsters and the squads dominating Ascend.</p>
  <div className="ascend-rank-mode" role="group" aria-label="Leaderboard type">
   <button className={view==='players'?'active':''} onClick={()=>setView('players')}><Trophy size={15}/> Player rankings</button>
   <button className={view==='squads'?'active':''} onClick={()=>setView('squads')}><ShieldCheck size={15}/> Squad domination</button>
  </div>
  {view==='players'&&<div className="ascend-category-grid">{categories.map(c=>{const Icon=c.icon;const active=category===c.id;return <button key={c.id} className={'ascend-category-card '+(active?'active':'')} onClick={()=>setCategory(c.id)} aria-pressed={active}><span className="ascend-category-icon"><Icon size={17}/></span><span className="ascend-category-copy"><b>{c.label}</b><small>{c.hint}</small></span><ChevronUp size={14} className="ascend-category-arrow"/></button>;})}</div>}
  {view==='players'&&myRank>0&&<div className="leaderboard-you ascend-you">
   <div className="leaderboard-you-icon"><ShieldCheck size={17}/></div><div className="leaderboard-you-copy"><b>Your rank · #{myRank}</b><span>{users.find(e=>e.user_id===userId)?.display_name} · {selected.label}</span></div><strong>{displayMetric(sorted[myRank-1])}</strong>
  </div>}
  {view==='squads'&&<div className="ascend-squad-banner"><div className="ascend-squad-banner-icon"><Swords size={25}/></div><div><span>FACTION WARFARE</span><h3>Squad Domination</h3><p>Collective army, Ascend levels, combat upgrades and team study progress power the squad score.</p></div><div className="ascend-squad-total"><b>{fmt(squads.length)}</b><span>FACTIONS</span></div></div>}
  {loading?<div className="leaderboard-empty"><span className="leaderboard-loader"/><b>Scanning the leaderboard…</b><span>Syncing army, wallet, combat and study stats.</span></div>:
   error?<div className="leaderboard-error" role="alert"><span>{error}</span><button onClick={()=>void load(true)}>Try again</button></div>:
   view==='players'?(sorted.length===0?<div className="leaderboard-empty"><div className="leaderboard-empty-icon"><Users size={22}/></div><b>The Hall of Legends is waiting.</b><span>Player rankings appear when student activity is recorded.</span></div>:<>
    <div className="ascend-rank-section-heading"><div><span className="eyebrow">LIVE CLASSIFICATION</span><h3>{selected.label}</h3></div><span>{sorted.length} ranked players</span></div>
    <div className="leaderboard-podium ascend-podium">{podiumEntries.map((entry,index)=>{const order=[1,0,2][index];const item=[{label:'01 · FIRST',className:'rank-first',icon:Crown},{label:'02 · SECOND',className:'rank-second',icon:Medal},{label:'03 · THIRD',className:'rank-third',icon:Medal}][order];const Icon=item.icon;return <article className={'leaderboard-podium-card '+item.className} key={entry.user_id}><span className="leaderboard-podium-label">{item.label}</span>{playerFlags[entry.user_id]&&<div className="leaderboard-flag-banner"><img src={playerFlags[entry.user_id]} alt={entry.display_name+' kingdom flag'}/><span>{entry.display_name}</span></div>}<div className="leaderboard-avatar">{entry.avatar_url?<img src={entry.avatar_url} alt=""/>:initials(entry.display_name)}</div><Icon size={19}/><b title={entry.display_name}>{entry.display_name}</b><strong>{displayMetric(entry)}</strong><span className="leaderboard-podium-meta">{number(entry.combat_level)} combat level · {number(entry.squad_count)} squads</span></article>;})}</div>
    <div className="leaderboard-table-wrap"><table className="leaderboard-table ascend-rank-table"><thead><tr><th>RANK</th><th>PLAYER</th><th>{selected.label.toUpperCase()}</th><th>ARMY</th><th>COINS</th><th>FOCUS</th><th>POWER</th></tr></thead><tbody>{sorted.map((entry,index)=><tr key={entry.user_id} className={entry.user_id===userId?'leaderboard-current':''}><td><span className={'leaderboard-rank '+(index<3?'top-rank':'')}>{String(index+1).padStart(2,'0')}</span></td><td><div className="leaderboard-student"><div className="leaderboard-avatar small">{entry.avatar_url?<img src={entry.avatar_url} alt=""/>:initials(entry.display_name)}</div><div><b>{entry.display_name}{entry.user_id===userId?' · YOU':''}</b><span>@{entry.username}</span>{playerFlags[entry.user_id]&&<img className="leaderboard-inline-flag" src={playerFlags[entry.user_id]} alt="Kingdom flag"/>}</div></div></td><td><b className="ascend-metric-value">{displayMetric(entry)}</b></td><td>{fmt(entry.army_quantity)}</td><td>{fmt(entry.coins)}</td><td>{duration(entry.focus_minutes)}</td><td>{fmt(entry.power_score)}</td></tr>)}</tbody></table></div>
   </>):(squads.length===0?<div className="leaderboard-empty"><div className="leaderboard-empty-icon"><Users size={22}/></div><b>No squads on the board yet.</b><span>Create a squad and recruit your first members to enter faction rankings.</span></div>:<>
    <div className="ascend-squad-podium">{squadTop.map((s,index)=><article key={s.squad_id} className={'ascend-squad-top-card place-'+(index+1)}><div className={'ascend-squad-banner place-banner-'+(index+1)}><span>ASCEND DOMINION</span><b>{index===0?'IMPERIAL LEGION':index===1?'ROYAL VANGUARD':'ELITE COALITION'}</b><i>{index===0?'✦ ✦ ✦':index===1?'✦ ✦':'✦'}</i></div><div className="ascend-squad-place">{index===0?<Crown size={18}/>:<Medal size={18}/>} <span>#{index+1} FACTION</span></div><div className="ascend-squad-emblem"><ShieldCheck size={27}/></div><h3>{s.squad_name}</h3><p>{s.description||'Forged by focus. Powered by teamwork.'}</p><strong>{fmt(s.squad_power)}</strong><small>DOMINATION POWER</small><div className="ascend-squad-stats"><span><Users size={13}/>{fmt(s.member_count)} members</span><span><Swords size={13}/>{fmt(s.army_quantity)} troops</span></div></article>)}</div>
    <div className="leaderboard-table-wrap"><table className="leaderboard-table ascend-rank-table"><thead><tr><th>RANK</th><th>SQUAD</th><th>POWER</th><th>ARMY</th><th>MEMBERS</th><th>FOCUS</th><th>COINS</th><th>CHECKPOINTS</th></tr></thead><tbody>{squads.map((s,index)=><tr key={s.squad_id}><td><span className={'leaderboard-rank '+(index<3?'top-rank':'')}>{String(index+1).padStart(2,'0')}</span></td><td><div className="ascend-squad-name-cell"><span><ShieldCheck size={16}/></span><div><b>{s.squad_name}</b><small>ASCEND LVL {fmt(s.ascend_level)}</small></div></div></td><td><b className="ascend-metric-value">{squadMetric(s)}</b></td><td>{fmt(s.army_quantity)}</td><td>{fmt(s.member_count)}</td><td>{duration(s.focus_minutes)}</td><td>{fmt(s.coins)}</td><td>{fmt(s.completed_steps)}</td></tr>)}</tbody></table></div>
   </>)}
  <div className="leaderboard-footnote"><Sparkles size={13}/><span>Rankings refresh from saved Supabase stats. Combat power is a transparent combined score, not a hidden or self-reported rating.</span></div>
 </section>;
}
