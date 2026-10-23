import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Activity, Award, BarChart3, CheckCircle2, RefreshCw, Search, ShieldCheck, Swords, TrendingUp, Trophy, Users } from 'lucide-react';

type Person = { id: string; username: string | null; full_name: string | null; avatar_url: string | null };
type CombatRanking = {user_id:string;combat_level:number|string;combat_rating:number|string;combat_wins:number|string;power_score:number|string;army_quantity:number|string};
type DayFocus = { date: string; minutes: number; hours: number };
type DayTasks = { date: string; created: number; completed: number; rate: number };
type DayCumulative = { date: string; hours: number };
type DayWeekday = { day: number; minutes: number };
type DayWeek = { date: string; day: string; hours: number };
type DayTasks14 = { date: string; completed: number; open: number };
type Subject = { id: string; name: string; color: string; total: number; completed: number; percent: number };
type Analytics = {
  user_id: string; name: string; username: string | null; avatar_url: string | null;
  week_goal: number; trees_grown: number; success_rate: number; weekly_success: number; monthly_success: number;
  overall_success: number; mastery: number; focus_hours: number; streak: number;
  average_score: number; exams_taken: number; top_subject: { subject: string; score: number } | null;
  focus_days: DayFocus[]; task_days: DayTasks[]; cumulative_days: DayCumulative[];
  weekday_minutes: DayWeekday[]; daily_week: DayWeek[]; tasks_14: DayTasks14[];
  sessions_split: { grown: number; withered: number }; subjects: Subject[];
};
type Props = { supabase: SupabaseClient | null; userId: string; initialTab?: 'analytics' | 'duels' };
const RED = '#EF4444';
const CYAN = '#38BDF8';
const subjectColors = ['#A855F7','#06B6D4','#10B981','#F97316','#3B82F6','#EAB308'];
const daysShort = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const pct = (n: number) => Math.max(0, Math.min(100, Number(n) || 0));
const dateLabel = (value: string) => value.slice(5).replace('-', '/');
const shortHours = (n: number) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 1 });
const safeArray = <T,>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];
const niceName = (p: Person) => p.full_name?.trim() || p.username || 'Student';

function Card({ eyebrow, title, children, className = '' }: { eyebrow: string; title: string; children: ReactNode; className?: string }) {
  return <section className={'aa-card ' + className}><div className="aa-card-heading"><div><span className="aa-eyebrow">{eyebrow}</span><h3>{title}</h3></div></div>{children}</section>;
}
function Metric({ icon: Icon, label, value, hint, tone = 'red' }: { icon: typeof TrendingUp; label: string; value: string; hint: string; tone?: string }) {
  return <article className="aa-kpi"><div className={'aa-kpi-icon ' + tone}><Icon size={17}/></div><span>{label}</span><b>{value}</b><small>{hint}</small></article>;
}
function Legend({ items }: { items: { label: string; color: string }[] }) {
  return <div className="aa-legend">{items.map(i=><span key={i.label}><i style={{ background: i.color }}/>{i.label}</span>)}</div>;
}
function ChartTooltip({ x, y, title, rows }: { x:number; y:number; title:string; rows:{label:string;value:string;color:string}[] }) {
  const w=196,h=43+rows.length*19,tx=Math.max(8,Math.min(760-w-8,x+14)),ty=Math.max(8,Math.min(238-h-8,y-h/2));
  return <g className="aa-chart-tooltip" pointerEvents="none">
    <rect x={tx} y={ty} width={w} height={h} rx="9" fill="#0b1220" stroke="rgba(148,163,184,.42)" strokeWidth="1" filter="drop-shadow(0 8px 15px rgba(0,0,0,.42))"/>
    <text x={tx+12} y={ty+17} className="aa-tooltip-title">{title}</text>
    {rows.map((r,i)=><g key={r.label}><circle cx={tx+14} cy={ty+32+i*19} r="3" fill={r.color}/><text x={tx+23} y={ty+36+i*19} className="aa-tooltip-label">{r.label}</text><text x={tx+w-11} y={ty+36+i*19} textAnchor="end" className="aa-tooltip-value">{r.value}</text></g>)}
  </g>;
}
function LineGraph({ data, series, max, ticks, suffix = '', area = false }: { data: { date: string; [key: string]: string | number }[]; series: { key: string; label: string; color: string }[]; max: number; ticks: number[]; suffix?: string; area?: boolean }) {
  const [hovered,setHovered]=useState<number|null>(null);
  const touchMode=useRef(false);
  const observedMax=Math.max(0,...data.flatMap(d=>series.map(item=>Number(d[item.key]||0))));
  const scaleMax=observedMax>0?observedMax:Math.max(1,max);
  const scaleTicks=Array.from({length:Math.max(2,ticks.length)},(_,i)=>Number((scaleMax*i/(Math.max(2,ticks.length)-1)).toFixed(2)));
  const W=760,H=238,L=42,R=12,T=12,B=30,innerW=W-L-R,innerH=H-T-B;
  const xAt=(i:number)=>L+(data.length<=1?0:i/(data.length-1))*innerW;
  const points=(key:string)=>data.map((d,i)=>({x:xAt(i),y:T+innerH-(pct(Number(d[key]||0)/Math.max(1,scaleMax)*100)/100)*innerH,value:Number(d[key]||0),label:String(d.date||'')}));
  const path=(ps:{x:number;y:number}[])=>ps.length?ps.map((p,i)=>(i===0?'M ':'L ')+p.x+','+p.y).join(' '):'';
  const hoveredX=hovered===null?0:xAt(hovered),hoveredY=hovered===null?T+innerH:Math.min(...series.map(s=>points(s.key)[hovered]?.y??T+innerH));
  const displayDate=(v:string)=>{const d=new Date(v+'T12:00:00');return Number.isNaN(d.getTime())?v:d.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});};
  return <div className="aa-chart-scroll"><svg className="aa-chart" viewBox={'0 0 '+W+' '+H} role="img" aria-label={series.map(s=>s.label).join(' versus ')+' chart'}>
    {scaleTicks.map(t=><g key={t}><line x1={L} x2={W-R} y1={T+innerH-t/Math.max(1,scaleMax)*innerH} y2={T+innerH-t/Math.max(1,max)*innerH} stroke="rgba(148,163,184,.15)" strokeDasharray="3 5"/><text x={L-8} y={T+innerH-t/Math.max(1,max)*innerH+4} textAnchor="end" className="aa-axis-text">{t}{suffix}</text></g>)}
    {series.map(s=>{const ps=points(s.key);const d=path(ps);const areaPath=d+' L '+(W-R)+' '+(T+innerH)+' L '+L+' '+(T+innerH)+' Z';return <g key={s.key}>{area&&<path d={areaPath} fill={s.color} opacity=".12"/>}<path d={d} fill="none" stroke={s.color} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>{ps.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={hovered===i?5:2.6} fill={s.color} stroke="#111827" strokeWidth="1.5" opacity={hovered===null||hovered===i?1:.68}/>)}</g>})}
    {data.map((d,i)=>{const left=i===0?L:xAt(i-1)+(xAt(i)-xAt(i-1))/2,right=i===data.length-1?W-R:xAt(i)+(xAt(i+1)-xAt(i))/2;return <rect key={'hit-'+String(d.date)} x={left} y={T} width={Math.max(1,right-left)} height={innerH} fill="transparent" onMouseEnter={()=>{if(!touchMode.current)setHovered(i)}} onMouseMove={()=>{if(!touchMode.current)setHovered(i)}} onMouseLeave={()=>{if(!touchMode.current)setHovered(null)}} onTouchStart={()=>{touchMode.current=true;setHovered(i)}} onClick={()=>setHovered(i)} onFocus={()=>setHovered(i)} tabIndex={0} role="button" aria-label={displayDate(String(d.date))+': '+series.map(s=>s.label+' '+Number(d[s.key]||0)+suffix).join(', ')}/>})}
    {data.map((d,i)=>i%5===0||i===data.length-1?<text key={String(d.date)} x={xAt(i)} y={H-8} textAnchor="middle" className="aa-axis-text">{dateLabel(String(d.date))}</text>:null)}
    {hovered!==null&&data[hovered]&&<ChartTooltip x={hoveredX} y={hoveredY} title={displayDate(String(data[hovered].date))} rows={series.map(s=>({label:s.label,value:shortHours(Number(data[hovered!][s.key]||0))+suffix,color:s.color}))}/>}
  </svg></div>;
}
function BarGraph({ data, keys, max, ticks, suffix = '' }: { data: { label: string; [key: string]: string | number }[]; keys: { key: string; label: string; color: string }[]; max: number; ticks: number[]; suffix?: string; labels?: boolean }) {
  const [hovered,setHovered]=useState<number|null>(null);
  const touchMode=useRef(false);
  const observedMax=Math.max(0,...data.flatMap(d=>keys.map(item=>Number(d[item.key]||0))));
  const scaleMax=observedMax>0?observedMax:Math.max(1,max);
  const scaleTicks=Array.from({length:Math.max(2,ticks.length)},(_,i)=>Number((scaleMax*i/(Math.max(2,ticks.length)-1)).toFixed(2)));
  const W=760,H=238,L=42,R=12,T=12,B=32,innerW=W-L-R,innerH=H-T-B,groupW=innerW/Math.max(1,data.length),barW=Math.min(24,groupW/(keys.length+1));
  const xAt=(i:number)=>L+i*groupW+groupW/2;
  const rows=hovered===null?[]:keys.map(k=>({label:k.label,value:shortHours(Number(data[hovered!]?.[k.key]||0))+suffix,color:k.color}));
  return <div className="aa-chart-scroll"><svg className="aa-chart" viewBox={'0 0 '+W+' '+H} role="img" aria-label="Bar chart">
    {scaleTicks.map(t=><g key={t}><line x1={L} x2={W-R} y1={T+innerH-t/Math.max(1,scaleMax)*innerH} y2={T+innerH-t/Math.max(1,max)*innerH} stroke="rgba(148,163,184,.15)" strokeDasharray="3 5"/><text x={L-8} y={T+innerH-t/Math.max(1,max)*innerH+4} textAnchor="end" className="aa-axis-text">{t}{suffix}</text></g>)}
    {data.map((d,i)=><g key={d.label}>{keys.map((k,j)=>{const v=Math.max(0,Number(d[k.key]||0)),h=v/Math.max(1,scaleMax)*innerH,x=L+i*groupW+groupW/2+(j-(keys.length-1)/2)*barW-barW/2,y=T+innerH-h;return <rect key={k.key} x={x} y={y} width={barW-3} height={h} rx="5" fill={k.color} opacity={hovered===null||hovered===i?".92":".55"}/>})}<text x={xAt(i)} y={H-8} textAnchor="middle" className="aa-axis-text">{d.label}</text><rect x={L+i*groupW} y={T} width={groupW} height={innerH} fill="transparent" onMouseEnter={()=>{if(!touchMode.current)setHovered(i)}} onMouseMove={()=>{if(!touchMode.current)setHovered(i)}} onMouseLeave={()=>{if(!touchMode.current)setHovered(null)}} onTouchStart={()=>{touchMode.current=true;setHovered(i)}} onClick={()=>setHovered(i)} onFocus={()=>setHovered(i)} tabIndex={0} role="button" aria-label={d.label+': '+keys.map(k=>k.label+' '+Number(d[k.key]||0)+suffix).join(', ')}/></g>)}
    {hovered!==null&&data[hovered]&&<ChartTooltip x={xAt(hovered)} y={T+innerH/2} title={data[hovered].label} rows={rows}/>}
  </svg></div>;
}
function RadarGraph({ a, b }: { a: Subject[]; b?: Subject[] }) {
  const [hovered,setHovered]=useState<number|null>(null);
  const W=360,H=300,cx=180,cy=145,r=92,n=6;
  const names=['Mathematics','Physics','Chemistry','English','Computer Science','Yoga'];
  const point=(i:number,value:number,scale=100)=>{const angle=(-Math.PI/2)+i*2*Math.PI/n,rr=r*pct(value)/scale;return [cx+Math.cos(angle)*rr,cy+Math.sin(angle)*rr] as const;};
  const ring=(value:number)=>Array.from({length:n},(_,i)=>point(i,value).join(',')).join(' ');
  const poly=(items:Subject[])=>Array.from({length:n},(_,i)=>point(i,items[i]?.percent||0).join(',')).join(' ');
  const focus=a[hovered??0];
  const rival=b?.[hovered??0];
  return <div className="aa-radar-interactive">
    <svg className="aa-radar" viewBox={'0 0 '+W+' '+H} role="img" aria-label="Interactive subject mastery hexagon. Hover or tap a subject to see its mastery details.">
      {[25,50,75,100].map(v=><polygon key={v} points={ring(v)} fill="none" stroke="rgba(148,163,184,.23)" strokeWidth="1"/>)} 
      {Array.from({length:n},(_,i)=>{const p=point(i,100);return <line key={i} x1={cx} y1={cy} x2={p[0]} y2={p[1]} stroke="rgba(148,163,184,.2)"/>})}
      <polygon points={poly(a)} fill={RED} fillOpacity=".22" stroke={RED} strokeWidth="2.4"/>
      {b&&<polygon points={poly(b)} fill={CYAN} fillOpacity=".2" stroke={CYAN} strokeWidth="2.4"/>}
      {Array.from({length:n},(_,i)=>{const p=point(i,119);const v=point(i,100);return <g key={i} className="aa-radar-axis-hit" tabIndex={0} role="button" aria-label={names[i]+': '+Math.round(a[i]?.percent||0)+'% mastery'+(b?', opponent '+Math.round(b[i]?.percent||0)+'%':'')} onMouseEnter={()=>setHovered(i)} onMouseLeave={()=>setHovered(null)} onFocus={()=>setHovered(i)} onBlur={()=>setHovered(null)} onClick={()=>setHovered(hovered===i?null:i)}><circle cx={v[0]} cy={v[1]} r="13" fill="transparent"/><circle cx={point(i,a[i]?.percent||0)[0]} cy={point(i,a[i]?.percent||0)[1]} r={hovered===i?5.5:3.5} fill={RED} stroke="#0b0c12" strokeWidth="1.5"/><text x={p[0]} y={p[1]} textAnchor={p[0]<cx-15?'end':p[0]>cx+15?'start':'middle'} className={'aa-radar-label '+(hovered===i?'radar-label-active':'')}>{names[i]}</text></g>})}
    </svg>
    {hovered!==null&&focus&&<div className="aa-radar-hover-card" role="status"><span className="aa-radar-hover-kicker">SUBJECT INTELLIGENCE</span><b>{focus.name||names[hovered]}</b><strong>{Math.round(focus.percent||0)}% <small>mastery</small></strong><div className="aa-radar-hover-track"><i style={{width:Math.max(0,Math.min(100,focus.percent||0))+'%'}}/></div><span>{focus.completed||0} / {focus.total||0} checkpoints complete</span>{rival&&<div className="aa-radar-rival">Opponent <b>{Math.round(rival.percent||0)}%</b></div>}</div>}
  </div>;
}
function Donut({ grown, withered }: { grown: number; withered: number }) {
  const total=Math.max(1,grown+withered),r=47,c=2*Math.PI*r,grownLen=c*grown/total,witheredLen=c*withered/total;
  return <div className="aa-donut-wrap"><svg viewBox="0 0 140 140" className="aa-donut"><circle cx="70" cy="70" r={r} fill="none" stroke="#293548" strokeWidth="16"/><circle cx="70" cy="70" r={r} fill="none" stroke="#10B981" strokeWidth="16" strokeDasharray={grownLen+' '+c} strokeLinecap="round" transform="rotate(-90 70 70)"/><circle cx="70" cy="70" r={r} fill="none" stroke="#F97316" strokeWidth="16" strokeDasharray={witheredLen+' '+c} strokeDashoffset={-grownLen-5} strokeLinecap="round" transform="rotate(-90 70 70)"/><text x="70" y="66" textAnchor="middle" className="aa-donut-number">{grown+withered}</text><text x="70" y="83" textAnchor="middle" className="aa-donut-caption">SESSIONS</text></svg><div className="aa-donut-legend"><span><i style={{background:'#10B981'}}/>Grown <b>{grown}</b></span><span><i style={{background:'#F97316'}}/>Withered <b>{withered}</b></span></div></div>;
}
function SubjectRings({ subjects }: { subjects: Subject[] }) {
  return <div className="aa-rings-layout"><svg viewBox="0 0 220 220" className="aa-rings" role="img" aria-label="Six concentric syllabus progress rings">{subjects.map((s,i)=>{const r=92-i*12,c=2*Math.PI*r;return <g key={s.id}><circle cx="110" cy="110" r={r} fill="none" stroke="#263245" strokeWidth="7"/><circle cx="110" cy="110" r={r} fill="none" stroke={s.color||subjectColors[i]} strokeWidth="7" strokeLinecap="round" strokeDasharray={c*pct(s.percent)/100+' '+c} transform="rotate(-90 110 110)"/></g>})}<text x="110" y="106" textAnchor="middle" className="aa-rings-center">{Math.round(subjects.length?subjects.reduce((s,x)=>s+x.percent,0)/subjects.length:0)}%</text><text x="110" y="124" textAnchor="middle" className="aa-rings-label">MASTERY</text></svg><div className="aa-subject-list">{subjects.map((s,i)=><div key={s.id} className="aa-subject-row"><span className="aa-subject-dot" style={{background:s.color||subjectColors[i]}}/><span>{s.name}</span><div className="aa-mini-track"><i style={{width:pct(s.percent)+'%',background:s.color||subjectColors[i]}}/></div><b>{Math.round(s.percent)}%</b></div>)}</div></div>;
}
function CompareBars({ you, them }: { you: Analytics; them: Analytics }) {
  const rows=[['DAILY SUCCESS',you.success_rate,them.success_rate,'%'],['WEEKLY SUCCESS',you.weekly_success,them.weekly_success,'%'],['MONTHLY SUCCESS',you.monthly_success,them.monthly_success,'%'],['OVERALL SUCCESS',you.overall_success,them.overall_success,'%'],['SYLLABUS MASTERY',you.mastery,them.mastery,'%'],['FOCUS HOURS',you.focus_hours,them.focus_hours,'h'],['STREAK',you.streak,them.streak,'d']] as [string,number,number,string][];
  return <div className="aa-compare-bars">{rows.map(([label,left,right,unit])=><div className="aa-compare-row" key={label}><b className="aa-compare-value red">{shortHours(left)}{unit}</b><div className="aa-compare-center"><span>{label}</span><div className="aa-duel-tracks"><i style={{width:pct(left/Math.max(left,right,1)*100)+'%',background:RED}}/><i style={{width:pct(right/Math.max(left,right,1)*100)+'%',background:CYAN}}/></div></div><b className="aa-compare-value cyan">{shortHours(right)}{unit}</b></div>)}</div>;
}
function ExamScore({ data, color }: { data: Analytics; color: string }) {
  return <article className="aa-exam-score" style={{'--user-accent':color} as CSSProperties}><div className="aa-exam-user"><span className="aa-avatar" style={{borderColor:color}}>{data.avatar_url?<img src={data.avatar_url} alt=""/>:data.name.slice(0,1).toUpperCase()}</span><b>{data.name}</b></div><strong>{shortHours(data.average_score)}<small>%</small></strong><span>Average score</span><div className="aa-exam-foot"><span><b>{data.exams_taken}</b> exams taken</span><span><b>{data.top_subject?.score ?? '—'}{data.top_subject?'%':''}</b> top score</span></div><small className="aa-top-subject">{data.top_subject?.subject || 'No marked exams yet'}</small></article>;
}
export default function AnalyticsPanel({ supabase, userId, initialTab = 'analytics' }: Props) {
  const [tab,setTab]=useState<'analytics'|'duels'>(initialTab);
  const [self,setSelf]=useState<Analytics|null>(null);
  const [opponent,setOpponent]=useState<Analytics|null>(null);
  const [combatRanks,setCombatRanks]=useState<CombatRanking[]>([]);
  const [opponents,setOpponents]=useState<Person[]>([]);
  const [selectedId,setSelectedId]=useState('');
  const [search,setSearch]=useState('');
  const [pickerOpen,setPickerOpen]=useState(false);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [error,setError]=useState('');
  const request=useRef(0);
  const activeUser=useRef(userId); activeUser.current=userId;

  const loadPeople=useCallback(async()=>{
    if(!supabase||!userId){setOpponents([]);return;}
    const {data,error:queryError}=await supabase.rpc('list_study_opponents');
    if(queryError)throw queryError;
    const people=(data??[]) as Person[];
    setOpponents(people);
    setSelectedId(current=>current&&people.some(p=>p.id===current)?current:(people[0]?.id||''));
  },[supabase,userId]);

  const load=useCallback(async(quiet=false)=>{
    const seq=++request.current,actor=userId;
    if(!supabase||!actor){setSelf(null);setOpponent(null);setLoading(false);setError('Sign in to view analytics.');return;}
    if(quiet)setRefreshing(true);else setLoading(true);
    setError('');
    try{
      const ids=[actor,...(tab==='duels'&&selectedId&&selectedId!==actor?[selectedId]:[])];
      const results=await Promise.all(ids.map(id=>supabase.rpc('get_study_analytics',{p_user_id:id})));
      if(seq!==request.current||activeUser.current!==actor)return;
      const failed=results.find(r=>r.error);
      if(failed?.error)throw failed.error;
      const mine=results[0].data as Analytics;
      const other=results[1]?.data as Analytics|undefined;
      setSelf(mine);
      setOpponent(other||null);
    }catch(reason){
      if(seq===request.current&&activeUser.current===actor){setSelf(null);setOpponent(null);setError(reason instanceof Error?reason.message:'Could not load study analytics. Please retry.');}
    }finally{if(seq===request.current){setLoading(false);setRefreshing(false);}}
  },[supabase,userId,selectedId,tab]);

  useEffect(()=>{setSelf(null);setOpponent(null);setLoading(true);void loadPeople().then(()=>void load()).catch(e=>{setError(e instanceof Error?e.message:'Could not load student directory.');setLoading(false);});return()=>{request.current+=1};},[userId,loadPeople,load]);
  useEffect(()=>{void load();},[selectedId,load]);
  useEffect(()=>{
    if(!supabase||!userId)return;
    const poll=window.setInterval(()=>void load(true),30000);
    return()=>window.clearInterval(poll);
  },[supabase,userId,selectedId,tab,load]);

  useEffect(()=>{
    if(!supabase||!userId||tab!=='duels'){setCombatRanks([]);return;}
    let alive=true;
    supabase.rpc('get_ascend_rankings',{p_limit:100}).then(({data,error})=>{
      if(!alive)return;
      if(error){setCombatRanks([]);return;}
      const wanted=new Set([userId,selectedId]);
      setCombatRanks(((data??[]) as CombatRanking[]).filter(row=>wanted.has(row.user_id)));
    });
    const channel=supabase.channel('duel-combat-'+userId+'-'+selectedId)
      .on('postgres_changes',{event:'*',schema:'public',table:'combat_fighters'},()=>{supabase.rpc('get_ascend_rankings',{p_limit:100}).then(({data,error})=>{if(alive&&!error){const wanted=new Set([userId,selectedId]);setCombatRanks(((data??[]) as CombatRanking[]).filter(row=>wanted.has(row.user_id)));}});})
      .on('postgres_changes',{event:'*',schema:'public',table:'combat_customizations'},()=>{supabase.rpc('get_ascend_rankings',{p_limit:100}).then(({data,error})=>{if(alive&&!error){const wanted=new Set([userId,selectedId]);setCombatRanks(((data??[]) as CombatRanking[]).filter(row=>wanted.has(row.user_id)));}});})
      .subscribe();
    return()=>{alive=false;void supabase.removeChannel(channel);};
  },[supabase,userId,selectedId,tab]);

  useEffect(()=>{
    if(!supabase||!userId)return;
    const channel=supabase.channel('analytics-live-'+userId+'-'+(selectedId||'none'))
      .on('postgres_changes',{event:'*',schema:'public',table:'focus_sessions'},()=>void load(true))
      .on('postgres_changes',{event:'*',schema:'public',table:'planner_tasks'},()=>void load(true))
      .on('postgres_changes',{event:'*',schema:'public',table:'exams'},()=>void load(true))
      .on('postgres_changes',{event:'*',schema:'public',table:'chapter_progress'},()=>void load(true))
      .subscribe();
    return()=>{void supabase.removeChannel(channel);};
  },[supabase,userId,selectedId,load]);

  const opponentPerson=opponents.find(p=>p.id===selectedId);
  const filteredPeople=opponents.filter(p=>(niceName(p)+' '+(p.username||'')).toLowerCase().includes(search.toLowerCase()));
  const d30=useMemo(()=>self?.focus_days||[],[self]);
  const focusLine=useMemo(()=>d30.map(d=>({date:d.date,hours:d.hours})),[d30]);
  const taskLine=useMemo(()=>safeArray<DayTasks>(self?.task_days).map(d=>({date:d.date,rate:d.rate})),[self]);
  const cumulative=useMemo(()=>safeArray<DayCumulative>(self?.cumulative_days).map(d=>({date:d.date,hours:d.hours})),[self]);
  const duelFocus=useMemo(()=>{if(!self||!opponent)return[];return self.focus_days.map((d,i)=>({date:d.date,you:d.hours,them:opponent.focus_days?.[i]?.hours||0}));},[self,opponent]);
  const duelTasks=useMemo(()=>{if(!self||!opponent)return[];return self.task_days.map((d,i)=>({date:d.date,you:d.rate,them:opponent.task_days?.[i]?.rate||0}));},[self,opponent]);
  const duelCumulative=useMemo(()=>{if(!self||!opponent)return[];return self.cumulative_days.map((d,i)=>({date:d.date,you:d.hours,them:opponent.cumulative_days?.[i]?.hours||0}));},[self,opponent]);
  const weekdays=useMemo(()=>daysShort.map((label,i)=>({label,you:(self?.weekday_minutes||[]).find(d=>d.day===i+1)?.minutes||0,them:(opponent?.weekday_minutes||[]).find(d=>d.day===i+1)?.minutes||0})),[self,opponent]);
  const weekHours=useMemo(()=>daysShort.map((label,i)=>({label,you:Number(self?.daily_week?.[i]?.hours||0),them:Number(opponent?.daily_week?.[i]?.hours||0)})),[self,opponent]);
  const tasks14=useMemo(()=>safeArray<DayTasks14>(self?.tasks_14).map(d=>({label:dateLabel(d.date),completed:d.completed,open:d.open})),[self]);

  return <section className="aa-page">
    <div className="aa-hero"><div><span className="aa-eyebrow"><span className="aa-live-dot"/> ASCEND OS · PERFORMANCE INTELLIGENCE</span><h2>{tab==='analytics'?(self?.name||'Your')+"'s performance, in numbers":(self?.name||'You')+' vs '+(opponent?.name||'your opponent')+', in numbers'}</h2><p>{tab==='analytics'?'Your personal progress, without comparisons.':'A real-time head-to-head view of study consistency and syllabus mastery.'}</p></div><button className="aa-refresh" onClick={()=>void load(true)} disabled={loading||refreshing}><RefreshCw size={14}/>{refreshing?'Syncing…':'Refresh'}</button></div>
    <div className="aa-tabs" role="tablist" aria-label="Analytics mode"><button role="tab" aria-selected={tab==='analytics'} className={tab==='analytics'?'active':''} onClick={()=>setTab('analytics')}><BarChart3 size={16}/>My Analytics</button><button role="tab" aria-selected={tab==='duels'} className={tab==='duels'?'active duel-tab':''} onClick={()=>setTab('duels')}><Swords size={16}/>Duels <span>1v1</span></button><div className="aa-tab-live"><i/>LIVE · LAST 30 DAYS</div></div>
    {error&&<div className="aa-error" role="alert"><span>{error}</span><button onClick={()=>void load()}>Retry</button></div>}
    {tab==='duels'&&<div className="aa-opponent-bar"><div className="aa-you-pill"><span className="aa-avatar">{self?.avatar_url?<img src={self.avatar_url} alt=""/>:(self?.name||'Y').slice(0,1).toUpperCase()}</span><div><small>CHALLENGER 01</small><b>{self?.name||'You'} <em>YOU</em></b></div></div><div className="aa-versus"><Swords size={19}/><span>VS</span></div><div className="aa-picker-wrap"><button className="aa-opponent-picker" onClick={()=>setPickerOpen(v=>!v)} aria-expanded={pickerOpen}><span className="aa-avatar cyan-avatar">{opponentPerson?.avatar_url?<img src={opponentPerson.avatar_url} alt=""/>:(opponent?.name||'').slice(0,1).toUpperCase()||'?'}</span><span><small>CHOOSE OPPONENT</small><b>{opponent?.name||opponentPerson?.full_name||'Select a student'}</b></span><span className="aa-chevron">⌄</span></button>{pickerOpen&&<div className="aa-picker-menu"><label><Search size={15}/><input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search students…"/></label><div className="aa-picker-list">{filteredPeople.map(p=><button key={p.id} className={p.id===selectedId?'selected':''} onClick={()=>{setSelectedId(p.id);setPickerOpen(false);setSearch('');}}><span className="aa-avatar cyan-avatar">{p.avatar_url?<img src={p.avatar_url} alt=""/>:niceName(p).slice(0,1).toUpperCase()}</span><span><b>{niceName(p)}</b><small>@{p.username||'student'}</small></span>{p.id===selectedId&&<CheckCircle2 size={16}/>}</button>)}{filteredPeople.length===0&&<p>No students match your search.</p>}</div></div>}</div></div>}
    {loading&&!self?<div className="aa-loading"><span className="aa-spinner"/><b>Syncing your study data…</b><small>Loading private, account-scoped metrics.</small></div>:!self?<div className="aa-empty"><Activity size={25}/><b>No analytics available yet</b><span>Sign in and refresh to load your personal study history.</span></div>:tab==='analytics'?<>
      <div className="aa-section-label"><span>PERSONAL ANALYTICS</span><b>01 / YOUR MOMENTUM</b></div>
      <div className="aa-kpi-grid"><Metric icon={TrendingUp} label="WEEK GOAL" value={shortHours(self.week_goal)+'%'} hint="of 14 focused hours" tone="red"/><Metric icon={Activity} label="TREES GROWN" value={String(self.trees_grown)} hint="completed focus sessions · 30d" tone="green"/><Metric icon={Trophy} label="SUCCESS RATE" value={shortHours(self.success_rate)+'%'} hint="tasks completed · 30d" tone="orange"/><Metric icon={Award} label="MASTERY" value={shortHours(self.mastery)+'%'} hint="published syllabus steps" tone="violet"/></div>
      <Card eyebrow="EXAMS" title="Exam mastery"><div className="aa-exam-single"><ExamScore data={self} color={RED}/><div className="aa-exam-insight"><span className="aa-insight-icon"><Trophy size={18}/></span><small>TOP-SCORING SUBJECT</small><b>{self.top_subject?.subject||'No marked exams yet'}</b><strong>{self.top_subject?shortHours(self.top_subject.score)+'%':'—'}</strong><p>{self.exams_taken} marked exam{self.exams_taken===1?'':'s'} counted from your account.</p></div></div></Card>
      <Card eyebrow="ACTUAL FOCUSED HOURS · COMPLETED SESSIONS" title="Focus trend — last 30 days"><LineGraph data={focusLine} series={[{key:'hours',label:self.name,color:RED}]} max={16} ticks={[0,4,8,12,16]} suffix="h"/><Legend items={[{label:self.name,color:RED}]}/></Card>
      <Card eyebrow="TASKS COMPLETED / CREATED" title="Daily Planner success"><LineGraph data={taskLine} series={[{key:'rate',label:self.name,color:RED}]} max={100} ticks={[0,25,50,75,100]} suffix="%"/><Legend items={[{label:self.name,color:RED}]}/></Card>
      <Card eyebrow="CUMULATIVE · 30 DAYS" title="Cumulative focus hours"><LineGraph data={cumulative} series={[{key:'hours',label:self.name,color:RED}]} max={200} ticks={[0,50,100,150,200]} suffix="h" area/><Legend items={[{label:self.name,color:RED}]}/></Card>
      <Card eyebrow="PER SUBJECT" title="Mastery shape"><div className="aa-radar-wrap"><RadarGraph a={self.subjects}/><div className="aa-radar-list">{self.subjects.map((s,i)=><span key={s.id}><i style={{background:s.color||subjectColors[i]}}/>{s.name}<b>{Math.round(s.percent)}%</b></span>)}</div></div></Card>
      <div className="aa-two-col"><Card eyebrow="RHYTHM" title="Average minutes by weekday"><BarGraph data={weekdays.map(d=>({label:d.label,value:d.you}))} keys={[{key:'value',label:self.name,color:RED}]} max={600} ticks={[0,150,300,450,600]} suffix="m"/></Card><Card eyebrow="FOCUS SESSIONS" title={self.name+' · grown vs withered'}><Donut grown={self.sessions_split.grown} withered={self.sessions_split.withered}/></Card></div>
      <Card eyebrow="LAST 14 DAYS" title="Tasks done vs left open"><BarGraph data={tasks14} keys={[{key:'completed',label:'Completed',color:'#10B981'},{key:'open',label:'Open',color:'#475569'}]} max={16} ticks={[0,4,8,12,16]}/><Legend items={[{label:'Completed',color:'#10B981'},{label:'Open',color:'#475569'}]}/></Card>
      <Card eyebrow="THIS WEEK" title="Daily hours — this week"><BarGraph data={weekHours.map(d=>({label:d.label,value:d.you}))} keys={[{key:'value',label:self.name,color:RED}]} max={8} ticks={[0,2,4,6,8]} suffix="h"/></Card>
      <Card eyebrow="SYLLABUS MASTERY" title={self.name+' · completion %'}><SubjectRings subjects={self.subjects}/></Card>
      <p className="aa-footnote"><ShieldCheck size={14}/> My Analytics only uses your account's aggregated records. No other student's data or comparison series is shown in this tab.</p>
    </>:!selectedId||!opponent?<div className="aa-empty"><Users size={25}/><b>Select a study opponent</b><span>{opponents.length?'Choose a student from the selector above to start a 1v1 comparison.':'No other student profiles are currently available in the platform directory.'}</span></div>:<>
      <div className="aa-section-label"><span>DUELS · HEAD-TO-HEAD</span><b>02 / THE MATCHUP</b></div>
      <div className="aa-duel-summary"><span className="aa-duel-dot red-dot"/><b>{self.name}</b><span>·</span><span className="aa-duel-dot cyan-dot"/><b>{opponent.name}</b><small>LAST 30 DAYS · LIVE METRICS</small></div>
      <Card eyebrow="COMBAT ARENA · PLAYER STATS" title="Combat power matchup"><div className="aa-combat-duel-grid">{[{id:userId,name:self.name,color:RED},{id:selectedId,name:opponent.name,color:CYAN}].map(person=>{const stats=combatRanks.find(row=>row.user_id===person.id);return <article key={person.id} className="aa-combat-duel-card" style={{'--duel-accent':person.color} as CSSProperties}><div className="aa-combat-duel-title"><span><Swords size={17}/></span><div><b>{person.name}</b><small>{person.id===userId?'YOUR COMBAT PROFILE':'OPPONENT PROFILE'}</small></div></div><div className="aa-combat-main-power"><small>COMBAT POWER</small><strong>{stats?Number(stats.power_score).toLocaleString('en-IN'):'—'}</strong></div><div className="aa-combat-stat-grid"><div><span>LEVEL</span><b>{stats?Number(stats.combat_level):'—'}</b></div><div><span>RATING</span><b>{stats?Number(stats.combat_rating).toLocaleString('en-IN'):'—'}</b></div><div><span>WINS</span><b>{stats?Number(stats.combat_wins).toLocaleString('en-IN'):'—'}</b></div><div><span>ARMY</span><b>{stats?Number(stats.army_quantity).toLocaleString('en-IN'):'—'}</b></div></div></article>;})}</div><p className="aa-combat-note"><ShieldCheck size={13}/> Combat metrics use saved profile stats. Duel analytics never exposes private wallet or account information.</p></Card>
      <Card eyebrow="EXAMS" title="Exam mastery"><div className="aa-exam-duel"><ExamScore data={self} color={RED}/><ExamScore data={opponent} color={CYAN}/></div></Card>
      <Card eyebrow="ACTUAL FOCUSED HOURS · COMPLETED SESSIONS" title="Focus trend — last 30 days"><LineGraph data={duelFocus} series={[{key:'you',label:self.name,color:RED},{key:'them',label:opponent.name,color:CYAN}]} max={16} ticks={[0,4,8,12,16]} suffix="h"/><Legend items={[{label:self.name,color:RED},{label:opponent.name,color:CYAN}]}/></Card>
      <Card eyebrow="TASKS COMPLETED / CREATED" title="Daily Planner success"><LineGraph data={duelTasks} series={[{key:'you',label:self.name,color:RED},{key:'them',label:opponent.name,color:CYAN}]} max={100} ticks={[0,25,50,75,100]} suffix="%"/><Legend items={[{label:self.name,color:RED},{label:opponent.name,color:CYAN}]}/></Card>
      <Card eyebrow="CUMULATIVE · 30 DAYS" title="The focus race"><LineGraph data={duelCumulative} series={[{key:'you',label:self.name,color:RED},{key:'them',label:opponent.name,color:CYAN}]} max={200} ticks={[0,50,100,150,200]} suffix="h" area/><Legend items={[{label:self.name,color:RED},{label:opponent.name,color:CYAN}]}/></Card>
      <Card eyebrow="PER SUBJECT" title={'Mastery shape — '+self.name+' vs '+opponent.name}><div className="aa-radar-wrap"><RadarGraph a={self.subjects} b={opponent.subjects}/><Legend items={[{label:self.name,color:RED},{label:opponent.name,color:CYAN}]}/><div className="aa-radar-list">{self.subjects.map((s,i)=><span key={s.id}><i style={{background:s.color||subjectColors[i]}}/>{s.name}<b>{Math.round(s.percent)}% <em>vs</em> {Math.round(opponent.subjects[i]?.percent||0)}%</b></span>)}</div></div></Card>
      <Card eyebrow="HEAD-TO-HEAD" title="Who's more consistent?"><CompareBars you={self} them={opponent}/><Legend items={[{label:self.name,color:RED},{label:opponent.name,color:CYAN}]}/></Card>
      <Card eyebrow="RHYTHM" title="Average minutes by weekday"><BarGraph data={weekdays.map(d=>({label:d.label,you:d.you,them:d.them}))} keys={[{key:'you',label:self.name,color:RED},{key:'them',label:opponent.name,color:CYAN}]} max={600} ticks={[0,150,300,450,600]} suffix="m"/><Legend items={[{label:self.name,color:RED},{label:opponent.name,color:CYAN}]}/></Card>
      <Card eyebrow="THIS WEEK" title={'Daily hours — '+self.name+' vs '+opponent.name}><BarGraph data={weekHours.map(d=>({label:d.label,you:d.you,them:d.them}))} keys={[{key:'you',label:self.name,color:RED},{key:'them',label:opponent.name,color:CYAN}]} max={8} ticks={[0,2,4,6,8]} suffix="h"/><Legend items={[{label:self.name,color:RED},{label:opponent.name,color:CYAN}]}/></Card>
      <p className="aa-footnote"><ShieldCheck size={14}/> Duel charts compare only aggregate study metrics. Task titles, exam names, and private records are never exposed.</p>
    </>}
  </section>;
}
