import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import Onboarding from './Onboarding';
import { Activity, ArrowUpRight, BookOpen, CarFront, Check, ChevronDown, CircleHelp, Clock3, Flame, Focus, Gauge, GraduationCap, LayoutDashboard, LogOut, Menu, Plus, Search, Settings2, ShieldCheck, Sparkles, Target, Trophy, Wallet, X } from 'lucide-react';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const supabase: SupabaseClient | null = url && key && !key.includes('your_supabase') ? createClient(url, key) : null;

type Task = { id: string; title: string; subject: string | null; priority: 'P1'|'P2'|'P3'; estimated_minutes: number; completed: boolean; study_day: string };
const subjects = ['Mathematics','Physics','Chemistry','English Core','Computer Science','Physical Education'];
const nav = [
  {label:'Overview',icon:LayoutDashboard},
  {label:'Syllabus',icon:BookOpen},
  {label:'Focus room',icon:Focus},
  {label:'Planner',icon:Target},
  {label:'Exams & marks',icon:GraduationCap},
  {label:'Garage',icon:CarFront},
  {label:'Leaderboard',icon:Trophy},
];
function studyDay() { const d = new Date(Date.now() - 4 * 60 * 60 * 1000); return d.toLocaleDateString('en-CA'); }
function App() {
  const [session,setSession] = useState<Session|null>(null);
  const [authReady,setAuthReady] = useState(!supabase);
  const [authMode,setAuthMode] = useState<'magic'|'google'>('magic');
  const [email,setEmail] = useState('');
  const [authMessage,setAuthMessage] = useState('');
  const [authBusy,setAuthBusy] = useState(false);
  const [profile,setProfile] = useState<any>(null);
  const [profileLoaded,setProfileLoaded] = useState(false);
  const [tasks,setTasks] = useState<Task[]>([]);
  const [taskTitle,setTaskTitle] = useState('');
  const [taskSubject,setTaskSubject] = useState(subjects[0]);
  const [taskPriority,setTaskPriority] = useState<'P1'|'P2'|'P3'>('P2');
  const [activeNav,setActiveNav] = useState('Overview');
  const [mobileNav,setMobileNav] = useState(false);
  const [focusSeconds,setFocusSeconds] = useState(25*60);
  const [focusRunning,setFocusRunning] = useState(false);
  const [focusCompleted,setFocusCompleted] = useState(false);
  const [focusSaving,setFocusSaving] = useState(false);
  const [focusRunId,setFocusRunId] = useState<string|null>(null);
  const [focusMode,setFocusMode] = useState('Pomodoro');
  const [coins,setCoins] = useState(1000);
  const [completedSteps,setCompletedSteps] = useState(0);
  const [notice,setNotice] = useState('');
  const [newTaskOpen,setNewTaskOpen] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({data}) => { setSession(data.session); setAuthReady(true); });
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,next) => { setSession(next); });
    return () => subscription.unsubscribe();
  },[]);
  useEffect(() => {
    if (!supabase || !session?.user) { setProfile(null); setProfileLoaded(false); return; }
    let cancelled = false;
    (async () => {
      const {data,error} = await supabase!.from('profiles').select('*').eq('id',session.user.id).maybeSingle();
      if (!cancelled && !error && data) setProfile(data);
      const {data:wallet} = await supabase!.from('wallets').select('coins').eq('user_id',session.user.id).maybeSingle();
      if (!cancelled && wallet) setCoins(wallet.coins);
      const {data:activeRun} = await supabase!.from('focus_session_runs').select('id,mode,target_minutes,started_at').eq('user_id',session.user.id).is('completed_at',null).gt('started_at',new Date(Date.now()-4*60*60*1000).toISOString()).order('started_at',{ascending:false}).limit(1).maybeSingle();
      if (!cancelled && activeRun) {
        const elapsedSeconds = Math.max(0,Math.floor((Date.now()-new Date(activeRun.started_at).getTime())/1000));
        const remaining = Math.max(0,activeRun.target_minutes*60-elapsedSeconds);
        setFocusRunId(activeRun.id);
        setFocusMode(activeRun.mode==='pomodoro'?'Pomodoro':activeRun.mode==='deep_sprint'?'Deep Sprint':activeRun.mode==='extreme_grind'?'Extreme Grind':'Pomodoro');
        setFocusSeconds(remaining);
        if (remaining===0) { setFocusCompleted(true); setFocusRunning(false); }
        else setFocusRunning(true);
      }
      const {data:taskRows} = await supabase!.from('planner_tasks').select('*').eq('user_id',session.user.id).eq('study_day',studyDay()).order('created_at');
      if (!cancelled && taskRows) setTasks(taskRows as Task[]);
      const {count} = await supabase!.from('chapter_progress').select('*',{count:'exact',head:true}).eq('user_id',session.user.id).eq('completed',true);
      if (!cancelled && count !== null) setCompletedSteps(count);
      if (!cancelled) setProfileLoaded(true);
    })().catch(() => { if (!cancelled) setProfileLoaded(true); });
    return () => { cancelled = true; };
  },[session?.user?.id]);
  useEffect(() => {
    if (!focusRunning) return;
    const id = window.setInterval(() => setFocusSeconds(s => {
      if (s <= 1) { setFocusRunning(false); setFocusCompleted(true); setNotice('Focus interval complete. Save your session to claim verified rewards.'); return 0; }
      return s - 1;
    }),1000);
    return () => window.clearInterval(id);
  },[focusRunning]);
  const done = tasks.filter(t=>t.completed).length;
  const percent = tasks.length ? Math.round(done/tasks.length*100) : 0;
  const greeting = useMemo(()=> { const h=new Date().getHours(); return h<12?'Good morning':h<18?'Good afternoon':'Good evening'; },[]);
  const fmt = (s:number) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  async function signIn() {
    if (!supabase) { setAuthMessage('Add your Supabase URL and publishable key to .env.local, then restart the dev server.'); return; }
    setAuthBusy(true); setAuthMessage('');
    try {
      if (authMode === 'google') {
        const {error} = await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin}});
        if (error) throw error;
      } else {
        if (!email.includes('@')) throw new Error('Enter a valid email address.');
        const {error} = await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:window.location.origin}});
        if (error) throw error;
        setAuthMessage('Magic link sent. Check your inbox to finish signing in.');
      }
    } catch(e) { setAuthMessage(e instanceof Error?e.message:'Sign-in failed. Please try again.'); }
    finally { setAuthBusy(false); }
  }
  async function addTask(e:FormEvent) {
    e.preventDefault(); if (!taskTitle.trim()) return;
    const row = {user_id:session!.user.id,title:taskTitle.trim(),subject:taskSubject,priority:taskPriority,estimated_minutes:25,study_day:studyDay(),completed:false};
    if (!supabase) { setNotice('Supabase is not configured yet.'); return; }
    const {data,error} = await supabase.from('planner_tasks').insert(row).select('*').single();
    if (error) { setNotice(error.message); return; }
    setTasks(old=>[...old,data as Task]); setTaskTitle(''); setNewTaskOpen(false); setNotice('Task added to your study board.');
  }
  async function toggleTask(task:Task) {
    if (!supabase) return;
    const completed = !task.completed;
    const {error} = await supabase.from('planner_tasks').update({completed,completed_at:completed?new Date().toISOString():null}).eq('id',task.id).eq('user_id',session!.user.id);
    if (error) { setNotice(error.message); return; }
    setTasks(old=>old.map(t=>t.id===task.id?{...t,completed}:t));
    if (completed) setNotice('Task complete. Keep your momentum.');
  }
  async function signOut() { await supabase?.auth.signOut(); setTasks([]); setProfile(null); setFocusRunning(false); setFocusRunId(null); setFocusCompleted(false); }
  async function startFocus() {
    if (!supabase || !session || focusSaving) return;
    if (focusRunId) { setFocusRunning(true); return; }
    setFocusSaving(true);
    const mode = focusMode === 'Pomodoro' ? 'pomodoro' : focusMode === 'Deep Sprint' ? 'deep_sprint' : 'extreme_grind';
    const {data,error} = await supabase.rpc('start_focus_session',{subject_name:taskSubject,mode_name:mode});
    if (error) setNotice('Could not start focus session: '+error.message);
    else { setFocusRunId((data as {session_id:string}).session_id); setFocusRunning(true); setFocusCompleted(false); }
    setFocusSaving(false);
  }
  async function resetFocus() {
    setFocusRunning(false);
    if (supabase && focusRunId) {
      const {error} = await supabase.rpc('cancel_focus_session',{run_id:focusRunId});
      if (error) { setNotice('Could not reset session: '+error.message); return; }
    }
    setFocusRunId(null); setFocusCompleted(false);
    setFocusSeconds(focusMode==='Pomodoro'?1500:focusMode==='Deep Sprint'?3000:5400);
  }
  async function settleFocus() {
    if (!supabase || !session || !focusCompleted || focusSaving) return;
    const mode = focusMode === 'Pomodoro' ? 'pomodoro' : focusMode === 'Deep Sprint' ? 'deep_sprint' : focusMode === 'Extreme Grind' ? 'extreme_grind' : 'stopwatch';
    setFocusSaving(true);
    if (!focusRunId) { setNotice('Start a focus session before claiming rewards.'); setFocusSaving(false); return; }
    const {data,error} = await supabase.rpc('complete_focus_session',{run_id:focusRunId});
    if (error) setNotice('Could not save focus session: '+error.message);
    else { const reward = data as {coins_earned:number;xp_earned:number}; setCoins(v=>v+reward.coins_earned); setFocusCompleted(false); setFocusRunId(null); setFocusSeconds(mode==='pomodoro'?1500:mode==='deep_sprint'?3000:5400); setNotice('Session saved · +'+reward.coins_earned+' Lumen Coins · +'+reward.xp_earned+' XP'); }
    setFocusSaving(false);
  }
  if (!authReady) return <div className="boot"><div className="brand-mark">L</div><span>INITIALIZING LUMEN</span></div>;
  if (!session) return <AuthScreen email={email} setEmail={setEmail} authMode={authMode} setAuthMode={setAuthMode} signIn={signIn} busy={authBusy} message={authMessage} />;
  if (session && supabase && !profileLoaded) return <div className="boot"><div className="brand-mark">L</div><span>LOADING YOUR WORKSPACE</span></div>;
  if (session && supabase && profile && !profile.school_target) return <Onboarding supabase={supabase} profile={profile} userId={session.user.id} onSaved={(next) => { setProfile(next); setNotice('Welcome to Lumen. Your workspace is ready.'); }} />;
  const isOperator = profile?.role === 'operator' || (session.user.email === 'astryxleo@gmail.com' && session.user.email_confirmed_at);
  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav?'sidebar-open':''}`}>
      <div className="brand"><div className="brand-mark">L</div><div><strong>LUMEN</strong><span>STUDY OPERATING SYSTEM</span></div><button className="icon-btn mobile-close" onClick={()=>setMobileNav(false)} aria-label="Close navigation"><X size={17}/></button></div>
      <div className="workspace-label">WORKSPACE <ChevronDown size={12}/></div>
      <div className="nav-list">{nav.map(item=><button key={item.label} className={`nav-item ${activeNav===item.label?'active':''}`} onClick={()=>{setActiveNav(item.label);setMobileNav(false);}}><item.icon size={17}/><span>{item.label}</span>{item.label==='Focus room'&&<span className="nav-dot"/>}</button>)}</div>
      {isOperator&&<><div className="workspace-label operator-label">OPERATOR</div><button className={`nav-item ${activeNav==='Control center'?'active':''}`} onClick={()=>{setActiveNav('Control center');setMobileNav(false);}}><ShieldCheck size={17}/><span>Control center</span><span className="operator-chip">ROOT</span></button></>}
      <div className="sidebar-bottom"><div className="streak-card"><div className="streak-icon"><Flame size={17}/></div><div><b>Build your streak</b><span>One session at a time.</span></div><ArrowUpRight size={15}/></div><button className="nav-item" onClick={()=>setActiveNav('Settings')}><Settings2 size={17}/><span>Settings</span></button><div className="user-card"><div className="avatar">{(profile?.full_name||session.user.email||'L').slice(0,1).toUpperCase()}</div><div className="user-meta"><b>{profile?.full_name||session.user.user_metadata?.full_name||'Student'}</b><span>{isOperator?'OPERATOR ACCESS':'CLASS XII · STUDENT'}</span></div><button className="icon-btn" title="Sign out" onClick={signOut}><LogOut size={16}/></button></div></div>
    </aside>
    {mobileNav&&<button className="scrim" onClick={()=>setMobileNav(false)} aria-label="Close menu"/>}
    <main className="main-area">
      <header className="topbar"><div className="top-left"><button className="icon-btn menu-toggle" onClick={()=>setMobileNav(true)} aria-label="Open navigation"><Menu size={19}/></button><div className="breadcrumb">Workspace <span>/</span> <b>{activeNav}</b></div></div><div className="top-actions"><div className="status-pill"><span/> SYSTEM ONLINE</div><div className="coin-pill"><span>◈</span>{coins.toLocaleString()} <small>LUMEN</small></div><button className="icon-btn" title="Help"><CircleHelp size={17}/></button></div></header>
      <div className="content">
        <div className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-line"/> YOUR PERSONAL COMMAND DECK</div><h1>{greeting}, <em>{(profile?.full_name||session.user.user_metadata?.full_name||'Scholar').split(' ')[0]}.</em></h1><p>Your ambition, measured in focused minutes.</p></div><div className="date-chip"><div className="date-dot"/>{new Date().toLocaleDateString('en-IN',{weekday:'short',day:'2-digit',month:'short',year:'numeric'})}</div></div>
        {notice&&<div className="notice"><Sparkles size={15}/>{notice}<button onClick={()=>setNotice('')} aria-label="Dismiss"><X size={14}/></button></div>}
        {activeNav==='Overview'&&<Overview tasks={tasks} done={done} percent={percent} focusSeconds={focusSeconds} fmt={fmt} setFocusSeconds={setFocusSeconds} focusRunning={focusRunning} setFocusRunning={setFocusRunning} focusMode={focusMode} setFocusMode={setFocusMode} setActiveNav={setActiveNav} completedSteps={completedSteps} coins={coins} startFocus={startFocus} resetFocus={resetFocus} focusCompleted={focusCompleted} focusSaving={focusSaving} sessionActive={!!focusRunId} />}
        {activeNav==='Planner'&&<section className="panel task-panel"><div className="section-heading"><div><span className="eyebrow">DAILY EXECUTION</span><h2>Study board</h2></div><button className="primary-btn" onClick={()=>setNewTaskOpen(v=>!v)}><Plus size={16}/> New task</button></div><div className="progress-row"><span>{done} of {tasks.length} tasks complete</span><b>{percent}%</b></div><div className="progress-track"><div style={{width:percent+'%'}}/></div><TaskList tasks={tasks} toggleTask={toggleTask}/>{newTaskOpen&&<form className="task-form" onSubmit={addTask}><input value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} placeholder="What will you work on?" autoFocus/><select value={taskSubject} onChange={e=>setTaskSubject(e.target.value)}>{subjects.map(s=><option key={s}>{s}</option>)}</select><select value={taskPriority} onChange={e=>setTaskPriority(e.target.value as 'P1'|'P2'|'P3')}><option value="P1">P1 · High</option><option value="P2">P2 · Normal</option><option value="P3">P3 · Low</option></select><button className="primary-btn" type="submit">Add task</button></form>}</section>}
        {activeNav==='Focus room'&&<FocusRoom focusSeconds={focusSeconds} fmt={fmt} focusRunning={focusRunning} setFocusRunning={setFocusRunning} focusMode={focusMode} setFocusMode={setFocusMode} focusCompleted={focusCompleted} settleFocus={settleFocus} focusSaving={focusSaving} startFocus={startFocus} resetFocus={resetFocus} sessionActive={!!focusRunId}/>}
        {activeNav==='Syllabus'&&<Syllabus completedSteps={completedSteps} setNotice={setNotice}/>}
        {activeNav==='Exams & marks'&&<Placeholder icon={GraduationCap} title="Exam command" text="Your exam calendar and marks analytics will live here." detail="Add your first exam from the next build phase."/>}
        {activeNav==='Garage'&&<Placeholder icon={CarFront} title="The dealership" text="A collection earned through consistency." detail="Vehicle catalog and secure purchases are the next module."/>}
        {activeNav==='Leaderboard'&&<Placeholder icon={Trophy} title="The leaderboard" text="Compete on focus, consistency and syllabus mastery." detail="Public profiles and duels will be enabled after privacy controls."/>}
        {activeNav==='Control center'&&isOperator&&<OperatorPanel setNotice={setNotice}/>}
        {activeNav==='Settings'&&<Placeholder icon={Settings2} title="Your preferences" text="Personalize your Lumen workspace." detail="Profile editing and avatar uploads are queued for the next module."/>}
        <footer className="footer"><span>◈ LUMEN <i>STUDY OS</i></span><span>BUILT FOR THE LONG GAME <span className="footer-dot">●</span></span></footer>
      </div>
    </main>
  </div>;
}
function AuthScreen({email,setEmail,authMode,setAuthMode,signIn,busy,message}:{email:string;setEmail:(s:string)=>void;authMode:'magic'|'google';setAuthMode:(s:'magic'|'google')=>void;signIn:()=>void;busy:boolean;message:string}) {
 return <div className="auth-shell"><div className="auth-ambient ambient-one"/><div className="auth-ambient ambient-two"/><div className="auth-card"><div className="brand auth-brand"><div className="brand-mark">L</div><div><strong>LUMEN</strong><span>STUDY OPERATING SYSTEM</span></div></div><div className="auth-kicker"><span/> YOUR NEXT CHAPTER STARTS HERE</div><h1>Make focus<br/>your <em>superpower.</em></h1><p className="auth-copy">One place for your syllabus, deep work, and the future you're building.</p><div className="auth-tabs"><button className={authMode==='magic'?'selected':''} onClick={()=>setAuthMode('magic')}>Email link</button><button className={authMode==='google'?'selected':''} onClick={()=>setAuthMode('google')}>Google</button></div>{authMode==='magic'&&<label className="field-label">EMAIL ADDRESS<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email"/></label>}<button className="auth-submit" onClick={signIn} disabled={busy}>{busy?'Connecting…':authMode==='google'?'Continue with Google':'Send secure sign-in link'} <ArrowUpRight size={16}/></button>{message&&<div className="auth-message">{message}</div>}<div className="auth-security"><ShieldCheck size={15}/> Your study data stays private to your account.</div><div className="auth-foot">DESIGNED FOR DISCIPLINE <span>·</span> POWERED BY YOU</div></div></div>;
}
function Overview({tasks,done,percent,focusSeconds,fmt,setFocusSeconds,focusRunning,setFocusRunning,focusMode,setFocusMode,setActiveNav,completedSteps,coins,startFocus,resetFocus,focusCompleted,focusSaving,sessionActive}:{tasks:Task[];done:number;percent:number;focusSeconds:number;fmt:(s:number)=>string;setFocusSeconds:(s:number)=>void;focusRunning:boolean;setFocusRunning:(b:boolean)=>void;focusMode:string;setFocusMode:(s:string)=>void;setActiveNav:(s:string)=>void;completedSteps:number;coins:number;startFocus:()=>void;resetFocus:()=>void;focusCompleted:boolean;focusSaving:boolean;sessionActive:boolean}) {
 const remaining=tasks.length-done;
 return <><div className="metrics-grid"><Metric label="SYLLABUS MASTERY" value={completedSteps?completedSteps.toString().padStart(2,'0'):'—'} suffix="steps" note="Completed checkpoints" icon={BookOpen} tone="cyan"/><Metric label="TODAY'S EXECUTION" value={percent+'%'} note={tasks.length?remaining+' tasks remaining':'No tasks planned yet'} icon={Target} tone="gold"/><Metric label="LUMEN BALANCE" value={coins.toLocaleString()} note="Your study economy" icon={Wallet} tone="crimson"/><Metric label="FOCUS STREAK" value="—" suffix="days" note="Consistency compounds" icon={Flame} tone="violet"/></div><div className="dashboard-grid"><section className="focus-card"><div className="focus-card-top"><div><span className="eyebrow">DEEP WORK PROTOCOL</span><h2>Enter the zone.</h2><p>Protect your attention. Let the rest wait.</p></div><div className="focus-symbol"><Focus size={21}/></div></div><div className="focus-modes">{['Pomodoro','Deep Sprint','Extreme Grind'].map(m=><button key={m} disabled={sessionActive} className={focusMode===m?'chosen':''} onClick={()=>{setFocusMode(m);setFocusRunning(false);void resetFocus();setFocusSeconds(m==='Pomodoro'?1500:m==='Deep Sprint'?3000:5400);}}>{m}</button>)}</div><div className="timer-face"><div className="timer-ring"><svg viewBox="0 0 220 220"><circle cx="110" cy="110" r="99" className="ring-bg"/><circle cx="110" cy="110" r="99" className="ring-progress" strokeDasharray="622" strokeDashoffset={622*(1-focusSeconds/(focusMode==='Pomodoro'?1500:focusMode==='Deep Sprint'?3000:5400))}/></svg><div className="timer-content"><span>{focusRunning?'IN SESSION':'READY WHEN YOU ARE'}</span><strong>{fmt(focusSeconds)}</strong><small>{focusMode.toUpperCase()}</small></div></div></div><div className="timer-controls"><button className="primary-btn" disabled={focusCompleted||focusSaving} onClick={()=>{if(focusRunning)setFocusRunning(false);else startFocus();}}>{focusRunning?'Pause session':sessionActive?'Resume focus':'Start focus'} <ArrowUpRight size={15}/></button><button className="icon-btn reset-btn" disabled={focusSaving} onClick={resetFocus} title="Reset timer"><Activity size={17}/></button>{focusCompleted&&<button className="primary-btn" disabled={focusSaving} onClick={()=>setActiveNav('Focus room')}>Claim completed session <ArrowUpRight size={15}/></button>}</div><div className="focus-note"><span/> TIMER RUNS WHILE YOU STAY IN THE ZONE</div></section><section className="panel daily-panel"><div className="section-heading"><div><span className="eyebrow">THE DAILY PLAN</span><h2>Today's priorities</h2></div><button className="text-btn" onClick={()=>setActiveNav('Planner')}>View board <ArrowUpRight size={14}/></button></div><div className="daily-summary"><div className="summary-ring"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="27"/><circle cx="32" cy="32" r="27" style={{strokeDasharray:170,strokeDashoffset:170*(1-percent/100)}}/></svg><b>{percent}%</b></div><div><strong>{tasks.length?done+' of '+tasks.length+' completed':'Start with one task'}</strong><span>{tasks.length?'Small wins stack up.':'Build your plan for today.'}</span></div></div><TaskList tasks={tasks.slice(0,4)} toggleTask={()=>setActiveNav('Planner')}/>{tasks.length===0&&<button className="empty-action" onClick={()=>setActiveNav('Planner')}><Plus size={15}/> Add your first task</button>}<div className="panel-bottom-link" onClick={()=>setActiveNav('Planner')}>OPEN DAILY PLANNER <ArrowUpRight size={14}/></div></section></div><div className="bottom-grid"><section className="panel subject-panel"><div className="section-heading"><div><span className="eyebrow">ACADEMIC ENGINE</span><h2>Your six pillars</h2></div><button className="text-btn" onClick={()=>setActiveNav('Syllabus')}>Syllabus <ArrowUpRight size={14}/></button></div><div className="subject-list">{subjects.map((s,i)=><div className="subject-row" key={s}><div className={'subject-icon subject-'+i}>{['∑','ϟ','⚗','Aa','Py','◈'][i]}</div><div className="subject-name"><b>{s}</b><span>{['Calculus & algebra','Mechanics & electricity','Physical to organic','Flamingo, Vistas & writing','Python & problem solving','Theory & practical'][i]}</span></div><div className="subject-progress"><div><span/><span/><span/><span/><span/></div><small>START HERE</small></div><ArrowUpRight size={14} className="muted-arrow"/></div>)}</div></section><section className="panel signal-panel"><div className="section-heading"><div><span className="eyebrow">MOMENTUM SIGNAL</span><h2>Consistency wins.</h2></div><div className="signal-icon"><Gauge size={18}/></div></div><div className="signal-graph"><div className="graph-grid"><span/><span/><span/><span/></div><svg viewBox="0 0 360 110" preserveAspectRatio="none"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#63e5f5" stopOpacity=".22"/><stop offset="100%" stopColor="#63e5f5" stopOpacity="0"/></linearGradient></defs><path d="M0,94 C30,85 34,65 62,72 S100,91 126,58 S165,67 188,43 S226,61 250,30 S294,49 320,22 S344,29 360,8 L360,110 L0,110 Z" fill="url(#area)"/><path d="M0,94 C30,85 34,65 62,72 S100,91 126,58 S165,67 188,43 S226,61 250,30 S294,49 320,22 S344,29 360,8" fill="none" stroke="#63e5f5" strokeWidth="2.2" vectorEffect="non-scaling-stroke"/></svg></div><div className="signal-footer"><div><b>YOUR NEXT SESSION</b><span>is the only one you need to win.</span></div><div className="signal-arrow"><ArrowUpRight size={18}/></div></div><div className="quote">“We are what we repeatedly do.”<span>— A REMINDER, NOT A DEADLINE</span></div></section></div></>;
}
function Metric({label,value,suffix,note,icon:Icon,tone}:{label:string;value:string;suffix?:string;note:string;icon:any;tone:string}) { return <div className="metric-card"><div className="metric-top"><span>{label}</span><div className={'metric-icon '+tone}><Icon size={16}/></div></div><div className="metric-value">{value}<small>{suffix}</small></div><div className="metric-note"><span className="metric-dot"/> {note}</div></div>; }
function TaskList({tasks,toggleTask}:{tasks:Task[];toggleTask:(task:Task)=>void}) { return <div className="task-list">{tasks.map(task=><div className={'task-row '+(task.completed?'task-done':'')} key={task.id}><button className={'task-check '+(task.completed?'checked':'')} onClick={()=>toggleTask(task)} aria-label={task.completed?'Mark incomplete':'Mark complete'}>{task.completed&&<Check size={12}/>}</button><div className="task-info"><b>{task.title}</b><span>{task.subject||'General study'} · {task.estimated_minutes} min</span></div><span className={'priority '+task.priority.toLowerCase()}>{task.priority}</span></div>)}</div>; }
function FocusRoom({focusSeconds,fmt,focusRunning,setFocusRunning,focusMode,setFocusMode,focusCompleted,settleFocus,focusSaving,startFocus,resetFocus,sessionActive}:{focusSeconds:number;fmt:(s:number)=>string;focusRunning:boolean;setFocusRunning:(b:boolean)=>void;focusMode:string;setFocusMode:(s:string)=>void;focusCompleted:boolean;settleFocus:()=>void;focusSaving:boolean;startFocus:()=>void;resetFocus:()=>void;sessionActive:boolean}) { return <section className="focus-room panel"><span className="eyebrow">ATTENTION IS YOUR ADVANTAGE</span><h2>One thing. Fully.</h2><p>Choose a protocol, set your intention, and begin.</p><div className="focus-modes">{['Pomodoro','Deep Sprint','Extreme Grind'].map(m=><button className={focusMode===m?'chosen':''} key={m} disabled={sessionActive} onClick={()=>{setFocusMode(m);setFocusRunning(false);void resetFocus();setFocusSeconds(m==='Pomodoro'?1500:m==='Deep Sprint'?3000:5400);}}>{m}</button>)}</div><div className="big-timer">{fmt(focusSeconds)}</div><div className="timer-controls"><button className="primary-btn" disabled={focusCompleted||focusSaving} onClick={()=>{if(focusRunning)setFocusRunning(false);else startFocus();}}>{focusRunning?'Pause':sessionActive?'Resume focus':'Begin focus'} <ArrowUpRight size={15}/></button><button className="secondary-btn" disabled={focusSaving} onClick={resetFocus}>Reset</button></div>{focusCompleted&&<button className="primary-btn focus-claim" disabled={focusSaving} onClick={settleFocus}>{focusSaving?'Saving session…':'Save session · claim coins'}</button>}<div className="focus-warning"><Clock3 size={15}/> The server anchors each session start and rejects early reward claims. Keep this tab open for the current timer.</div></section>; }
function Syllabus({completedSteps,setNotice}:{completedSteps:number;setNotice:(s:string)=>void}) { return <section className="panel syllabus-panel"><div className="section-heading"><div><span className="eyebrow">CLASS XII · NCERT</span><h2>Syllabus atlas</h2></div><span className="badge">6 SUBJECTS</span></div><p className="muted-copy">Your chapter checklist syncs to your account. Subject curriculum content is the next seed-data pass.</p><div className="syllabus-grid">{subjects.map((s,i)=><button className="syllabus-tile" key={s} onClick={()=>setNotice(s+' curriculum content is queued for the next content-seeding pass.')}><div className={'subject-icon subject-'+i}>{['∑','ϟ','⚗','Aa','Py','◈'][i]}</div><b>{s}</b><span>{i===0?'Exercises & misc.':i===1?'Parts I & II':i===2?'Physical, inorganic, organic':i===3?'Flamingo, Vistas, writing':i===4?'Theory & code practice':'Theory & practical'}</span><small>{i===0&&completedSteps>0?completedSteps+' saved checkpoints':'CURRICULUM TO SEED'}</small></button>)}</div></section>; }
function OperatorPanel({setNotice}:{setNotice:(s:string)=>void}) { return <section className="panel operator-panel"><div className="section-heading"><div><span className="eyebrow">ROOT ACCESS · OPERATOR EDITION</span><h2>Control center</h2></div><span className="badge badge-gold"><ShieldCheck size={13}/> VERIFIED ROLE</span></div><div className="operator-warning"><ShieldCheck size={18}/><div><b>Operator identity detected</b><span>Administrative APIs will be enabled after backend policy verification and telemetry RPCs are connected.</span></div></div><div className="operator-grid"><button onClick={()=>setNotice('User inspector needs a secured operator-only search RPC before exposing global student data.')}><Search/><b>User inspector</b><span>Progress & readiness</span></button><button onClick={()=>setNotice('Economy airdrops use the operator_adjust_wallet RPC; add a target user and reason in the next admin form.')}><Wallet/><b>Reward terminal</b><span>Audited coin & cash drops</span></button><button onClick={()=>setNotice('Broadcast publishing is protected by RLS. The composer UI is part of the next module.')}><Activity/><b>Global broadcast</b><span>System-wide alerts</span></button><button onClick={()=>setNotice('Marketplace catalog management is protected by operator RLS. Vehicle editor is the next module.')}><CarFront/><b>Marketplace dispatch</b><span>Inventory & releases</span></button></div></section>; }
function Placeholder({icon:Icon,title,text,detail}:{icon:any;title:string;text:string;detail:string}) { return <section className="panel placeholder"><div className="placeholder-icon"><Icon size={23}/></div><span className="eyebrow">LUMEN MODULE</span><h2>{title}</h2><p>{text}</p><div className="placeholder-detail"><Sparkles size={15}/>{detail}</div></section>; }
export default App;
