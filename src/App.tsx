import { useEffect, useMemo, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { createPortal } from 'react-dom';
import Onboarding from './Onboarding';
import ascendLogo from '../ascend.png';
import OperatorPanel from './OperatorPanel';
import SettingsPanel from './SettingsPanel';
import UpdatesPanel from './UpdatesPanel';
import LeaderboardPanel from './LeaderboardPanel';
import AchievementsPanel from './AchievementsPanel';
import AnalyticsPanel from './AnalyticsPanel';
import SquadPanel from './SquadPanel';
import CombatPanel from './CombatPanel';
import { Activity, ArrowUpRight, Bell, BookOpen, ChartNoAxesColumn, Check, ChevronDown, CircleHelp, Clock3, Flame, Focus, Gauge, GraduationCap, LayoutDashboard, LogOut, Menu, Plus, Settings2, ShieldCheck, Award, Sparkles, Swords, Target, Trophy, Wallet, Users, X } from 'lucide-react';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const supabase: SupabaseClient | null = url && key && !key.includes('your_supabase') ? createClient(url, key) : null;
const ascendBootVideo = new URL('../AscendBoot.mp4', import.meta.url).href;

type Task = { id: string; title: string; subject: string | null; priority: 'P1'|'P2'|'P3'; estimated_minutes: number; completed: boolean; study_day: string };
const subjects = ['Mathematics','Physics','Chemistry','English Core','Computer Science','Yoga'];
const nav = [
  {label:'Overview',icon:LayoutDashboard},
  {label:'Syllabus',icon:BookOpen},
  {label:'Focus room',icon:Focus},
  {label:'Planner',icon:Target},
  {label:'Exams & marks',icon:GraduationCap},
  {label:'Updates',icon:Bell},
  {label:'Leaderboard',icon:Trophy},
  {label:'Combat Arena',icon:Swords},
  {label:'Duels',icon:Swords},
  {label:'Squads',icon:Users},
  {label:'Achievements',icon:Award},
  {label:'Analytics',icon:ChartNoAxesColumn},
];

const routeByLabel: Record<string, string> = {
  'Overview': '/', 'Syllabus': '/syllabus', 'Focus room': '/focus',
  'Planner': '/planner', 'Exams & marks': '/exams', 'Updates': '/updates',
  'Leaderboard': '/leaderboard', 'Combat Arena': '/combat', 'Duels': '/duels',
  'Squads': '/squads', 'Achievements': '/achievements', 'Analytics': '/analytics',
  'Control center': '/operator', 'Settings': '/settings',
};
const labelByRoute = Object.fromEntries(Object.entries(routeByLabel).map(([label, route]) => [route, label])) as Record<string, string>;
function labelFromPath(path: string) {
  const normalized = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  return labelByRoute[normalized] || 'Overview';
}

function studyDay() { const d = new Date(Date.now() - 4 * 60 * 60 * 1000); const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d); const part = (type: string) => parts.find(item => item.type === type)?.value ?? ''; return `${part('year')}-${part('month')}-${part('day')}`; }
function shiftStudyDay(day: string, amount: number) { const d = new Date(`${day}T12:00:00.000Z`); d.setUTCDate(d.getUTCDate() + amount); return d.toISOString().slice(0, 10); }
function shouldShowBootIntro() {
  try {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    // Play on a fresh browser navigation, but never replay on refresh (including Ctrl+R).
    return navigation?.type !== 'reload';
  } catch { return true; }
}

function App() {
  const [session,setSession] = useState<Session|null>(null);
  const activeUserIdRef = useRef<string | null>(null);
  activeUserIdRef.current = session?.user.id ?? null;
  const [authReady,setAuthReady] = useState(!supabase);
  const [bootIntroDone,setBootIntroDone] = useState(() => !shouldShowBootIntro());
  const [helpOpen,setHelpOpen] = useState(false);
  const [showTutorialNudge,setShowTutorialNudge] = useState(false);
  const [authMode,setAuthMode] = useState<'login'|'signup'>('login');
  const [password,setPassword] = useState('');
  const [email,setEmail] = useState('');
  const [authMessage,setAuthMessage] = useState('');
  const [authBusy,setAuthBusy] = useState(false);
  const [profile,setProfile] = useState<any>(null);
  const [profileLoaded,setProfileLoaded] = useState(false);
  const [tasks,setTasks] = useState<Task[]>([]);
  const [plannerDay,setPlannerDay] = useState(studyDay());
  const activePlannerDayRef = useRef(plannerDay);
  activePlannerDayRef.current = plannerDay;
  const [taskTitle,setTaskTitle] = useState('');
  const [taskSubject,setTaskSubject] = useState(subjects[0]);
  const [taskPriority,setTaskPriority] = useState<'P1'|'P2'|'P3'>('P2');
  const [activeNav,setActiveNav] = useState(() => labelFromPath(window.location.pathname));
  const navigate = (label: string) => {
    const path = routeByLabel[label] || '/';
    if (window.location.pathname !== path) window.history.pushState({ page: label }, '', path);
    setActiveNav(label);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  useEffect(() => {
    const onPopState = () => setActiveNav(labelFromPath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const [mobileNav,setMobileNav] = useState(false);
  const [operatorMode,setOperatorMode] = useState(false);
  useEffect(() => { setOperatorMode(false); }, [session?.user.id]);
  useEffect(() => {
    if (activeNav === 'Control center' && !operatorMode && session?.user.email?.toLowerCase() === 'astryxleo@gmail.com') navigate('Overview');
  }, [activeNav, operatorMode, session?.user.email]);
  useEffect(()=>{const body=document.body;if(!bootIntroDone)body.classList.add('ascend-intro-lock');else body.classList.remove('ascend-intro-lock');return()=>body.classList.remove('ascend-intro-lock');},[bootIntroDone]);
  useEffect(()=>{if(!session?.user.id||!profileLoaded||!profile?.school_target)return;try{if(!localStorage.getItem('ascend-tutorial-seen:'+session.user.id))setShowTutorialNudge(true);}catch{}},[session?.user.id,profileLoaded,profile?.school_target]);
  const markTutorialSeen=()=>{try{if(session?.user.id)localStorage.setItem('ascend-tutorial-seen:'+session.user.id,'1');}catch{}setShowTutorialNudge(false);};
  const openTutorial=()=>{markTutorialSeen();setHelpOpen(true);};
  const [focusSeconds,setFocusSeconds] = useState(25*60);
  const [focusRunning,setFocusRunning] = useState(false);
  const [focusCompleted,setFocusCompleted] = useState(false);
  const [focusSaving,setFocusSaving] = useState(false);
  const [focusRunId,setFocusRunId] = useState<string|null>(null);
  const [focusPaused,setFocusPaused] = useState(false);
  const [focusPipWindow,setFocusPipWindow] = useState<Window|null>(null);
  const [focusMode,setFocusMode] = useState('Pomodoro');
  const [customFocusMinutes,setCustomFocusMinutes] = useState(60);
  const openFocusPictureInPicture = async () => {
    const pipApi = (window as unknown as {documentPictureInPicture?:{requestWindow:(options:{width:number;height:number})=>Promise<Window>}}).documentPictureInPicture;
    if (!pipApi) { setNotice('Floating focus timer needs a Chromium browser that supports Document Picture-in-Picture. Keep Ascend open in a tab for now.'); return; }
    try {
      const pip = await pipApi.requestWindow({width:340,height:250});
      pip.document.title = 'Ascend Focus';
      const style = pip.document.createElement('style');
      style.textContent = 'html,body{margin:0;width:100%;height:100%;background:#07090f;color:#f8fafc;font-family:Inter,system-ui,sans-serif}body{overflow:hidden}*{box-sizing:border-box}';
      pip.document.head.appendChild(style);
      setFocusPipWindow(pip);
      pip.addEventListener('pagehide',()=>setFocusPipWindow(current=>current===pip?null:current),{once:true});
    } catch { setNotice('Floating timer window was blocked. Click the blue focus icon again to retry.'); }
  };
  useEffect(()=>{
    if (!focusPipWindow) return;
    const onKey = (event:KeyboardEvent) => { if(event.key==='Escape') focusPipWindow.close(); };
    focusPipWindow.addEventListener('keydown',onKey);
    return()=>focusPipWindow.removeEventListener('keydown',onKey);
  },[focusPipWindow]);

  const [coins,setCoins] = useState(1000);
  const [completedSteps,setCompletedSteps] = useState(0);
  const [totalSyllabusSteps,setTotalSyllabusSteps] = useState(0);
  const [notice,setNotice] = useState('');
  const [newTaskOpen,setNewTaskOpen] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    // A newer auth event must win over a slower initial session restore.
    let authEventSeen = false;
    supabase.auth.getSession().then(({data,error}) => {
      if (!authEventSeen) {
        if (error) setAuthMessage('Could not restore your session: ' + error.message);
        activeUserIdRef.current = data.session?.user.id ?? null;
        setSession(data.session);
      }
      setAuthReady(true);
    }).catch(() => {
      if (!authEventSeen) setAuthMessage('Could not restore your session because of a network error. Please reload and try again.');
      setAuthReady(true);
    });
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,next) => {
      authEventSeen = true;
      // Invalidate in-flight account-scoped actions synchronously, before React rerenders.
      activeUserIdRef.current = next?.user.id ?? null;
      setSession(next);
      setAuthReady(true);
    });
    return () => subscription.unsubscribe();
  },[]);
  useEffect(() => {
    if (!supabase || !session?.user.id) return;
    const actorId = session.user.id;
    const onDatabaseChange = (payload: any) => {
      window.dispatchEvent(new CustomEvent('ascend:realtime', { detail: payload }));
      const table = payload.table;
      const row = (payload.new && Object.keys(payload.new).length ? payload.new : payload.old) as Record<string, any>;
      if (table === 'wallets' && row.user_id === actorId && Number.isFinite(Number(row.coins))) setCoins(Number(row.coins));
      if (table === 'planner_tasks' && row.user_id === actorId && row.study_day === activePlannerDayRef.current) {
        void supabase.from('planner_tasks').select('*').eq('user_id', actorId).eq('study_day', activePlannerDayRef.current).order('created_at')
          .then(({data,error})=>{if(!error&&activeUserIdRef.current===actorId&&data)setTasks(data as Task[])});
      }
      if (table === 'chapter_progress') void supabase.from('chapter_progress').select('*',{count:'exact',head:true}).eq('user_id',actorId).eq('completed',true)
        .then(({count,error})=>{if(!error&&activeUserIdRef.current===actorId&&count!==null)setCompletedSteps(count)});
      if (table === 'profiles' && row.id === actorId) void supabase.from('profiles').select('*').eq('id',actorId).maybeSingle()
        .then(({data,error})=>{if(!error&&activeUserIdRef.current===actorId&&data)setProfile(data)});
    };
    const realtimeTables = ['activity_events','broadcasts','chapter_progress','combat_cosmetic_catalog','combat_cosmetic_owned','combat_customizations','combat_fighters','combat_matches','combat_weapon_skill_catalog','exams','focus_session_runs','focus_sessions','planner_tasks','profiles','study_duels','study_squad_challenges','study_squad_members','study_squads','syllabus_steps','wallet_transactions','wallets'];
    let channel = supabase.channel('ascend-live-workspace-' + actorId);
    for (const table of realtimeTables) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, onDatabaseChange);
    }
    channel.subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [session?.user.id]);
  useEffect(() => {
    let cancelled = false;
    // Clear account-scoped UI immediately on sign-out or account switch. Never
    // let the previous account's wallet or active timer flash in the new workspace.
    setProfile(null);
    setProfileLoaded(false);
    setCoins(0);
    setCompletedSteps(0);
    setFocusRunId(null);
    setFocusPaused(false);
    setFocusRunning(false);
    setFocusCompleted(false);
    setFocusSaving(false);
    setFocusMode('Pomodoro');
    setFocusSeconds(25 * 60);
    if (!supabase || !session?.user) {
      setTasks([]);
      return () => { cancelled = true; };
    }
    (async () => {
      const {data,error} = await supabase!.from('profiles').select('*').eq('id',session.user.id).maybeSingle();
      if (!cancelled) {
        if (error) setNotice('Could not load your profile: ' + error.message);
        else if (data) setProfile(data);
        else setNotice('Your profile record was not found. Please contact support before continuing.');
      }
      const {data:wallet,error:walletError} = await supabase!.from('wallets').select('coins').eq('user_id',session.user.id).maybeSingle();
      if (!cancelled && walletError) setNotice('Could not load your Ascend OS wallet: ' + walletError.message);
      if (!cancelled && !walletError && !wallet) setNotice('Your wallet record was not found. Your displayed balance may be incomplete; please contact support.');
      if (!cancelled && wallet) setCoins(wallet.coins);
      const {data:activeRun,error:activeRunError} = await supabase!.from('focus_session_runs').select('id,mode,target_minutes,started_at,paused_at,paused_seconds').eq('user_id',session.user.id).is('completed_at',null).or('paused_at.not.is.null,started_at.gt.'+new Date(Date.now()-4*60*60*1000).toISOString()).order('started_at',{ascending:false}).limit(1).maybeSingle();
      if (!cancelled && activeRunError) setNotice('Could not restore your active focus session: ' + activeRunError.message);
      if (!cancelled && activeRun) {
        const wallSeconds = Math.max(0,Math.floor((Date.now()-new Date(activeRun.started_at).getTime())/1000));
        const pausedNowSeconds = activeRun.paused_at ? Math.max(0,Math.floor((Date.now()-new Date(activeRun.paused_at).getTime())/1000)) : 0;
        const elapsedSeconds = Math.max(0,wallSeconds-(Number(activeRun.paused_seconds)||0)-pausedNowSeconds);
        const remaining = Math.max(0,activeRun.target_minutes*60-elapsedSeconds);
        setFocusPaused(Boolean(activeRun.paused_at));
        setFocusRunId(activeRun.id);
        setFocusMode(activeRun.mode==='pomodoro'?'Pomodoro':activeRun.mode==='deep_sprint'?'Deep Sprint':activeRun.mode==='extreme_grind'?'Extreme Grind':activeRun.mode==='custom'?'Custom':'Pomodoro');
        if (activeRun.mode==='custom') setCustomFocusMinutes(activeRun.target_minutes);
        setFocusSeconds(remaining);
        if (remaining===0 && !activeRun.paused_at) { setFocusCompleted(true); setFocusRunning(false); }
        else if (activeRun.paused_at) { setFocusCompleted(false); setFocusRunning(false); }
        else setFocusRunning(true);
      }
      const {count:totalCount,error:totalError} = await supabase!.from('syllabus_steps').select('*',{count:'exact',head:true});
      if(!cancelled&&!totalError&&totalCount!==null)setTotalSyllabusSteps(totalCount);
      const {count,error:countError} = await supabase!.from('chapter_progress').select('*',{count:'exact',head:true}).eq('user_id',session.user.id).eq('completed',true);
      if (!cancelled && countError) setNotice('Could not load your syllabus progress total: ' + countError.message);
      if (!cancelled && !countError && count !== null) setCompletedSteps(count);
      if (!cancelled) setProfileLoaded(true);
    })().catch(() => { if (!cancelled) { setNotice('Could not load your workspace because of a network error. Please reload and try again.'); setProfileLoaded(true); } });
    return () => { cancelled = true; };
  },[session?.user?.id]);
  useEffect(()=>{if(!supabase||!session?.user.id){setTasks([]);return;}let alive=true;setTasks([]);(async()=>{try{const {data,error}=await supabase.from('planner_tasks').select('*').eq('user_id',session.user.id).eq('study_day',plannerDay).order('created_at');if(!alive)return;if(error){setNotice('Could not load planner history: '+error.message);return;}setTasks((data??[]) as Task[]);}catch{if(alive)setNotice('Could not load planner history because of a network error. Please retry by changing the study day.');}})();return()=>{alive=false};},[session?.user?.id,plannerDay]);
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
      if (!email.includes('@')) throw new Error('Enter a valid email address.');
      if (password.length < 8) throw new Error('Password must be at least 8 characters.');
      if (authMode === 'signup') {
        const {data,error} = await supabase.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin}});
        if (error) throw error;
        if (!data.session) setAuthMessage('Account created. Check your email to confirm your account, then sign in.');
        else setAuthMessage('Account created successfully. Welcome to Ascend OS.');
      } else {
        const {error} = await supabase.auth.signInWithPassword({email,password});
        if (error) throw error;
      }
    } catch(e) { setAuthMessage(e instanceof Error?e.message:'Authentication failed. Please try again.'); }
    finally { setAuthBusy(false); }
  }
  async function addTask(e:FormEvent) {
    e.preventDefault(); if (!taskTitle.trim()) return;
    const row = {user_id:session!.user.id,title:taskTitle.trim(),subject:taskSubject,priority:taskPriority,estimated_minutes:25,study_day:plannerDay,completed:false};
    if (!supabase) { setNotice('Supabase is not configured yet.'); return; }
    try {
      const {data,error} = await supabase.from('planner_tasks').insert(row).select('*').single();
      if (activeUserIdRef.current !== row.user_id || activePlannerDayRef.current !== row.study_day) return;
      if (error) { setNotice('Could not add task: '+error.message); return; }
      setTasks(old=>[...old,data as Task]); setTaskTitle(''); setNewTaskOpen(false); setNotice('Task added to your study board.');
    } catch (error) {
      if (activeUserIdRef.current === row.user_id && activePlannerDayRef.current === row.study_day) setNotice('Could not add task because of a network error. Please try again.');
    }
  }
  async function toggleTask(task:Task) {
    if (!supabase || !session?.user.id) return;
    const actorId = session.user.id;
    const completed = !task.completed;
    try {
      const {error} = await supabase.from('planner_tasks').update({completed,completed_at:completed?new Date().toISOString():null}).eq('id',task.id).eq('user_id',actorId);
      if (activeUserIdRef.current !== actorId || activePlannerDayRef.current !== task.study_day) return;
      if (error) { setNotice('Could not update task: '+error.message); return; }
      setTasks(old=>old.map(t=>t.id===task.id?{...t,completed}:t));
      if (completed) setNotice('Task complete. Keep your momentum.');
    } catch {
      if (activeUserIdRef.current === actorId && activePlannerDayRef.current === task.study_day) setNotice('Could not update task because of a network error. Please try again.');
    }
  }
  async function signOut() {
    if (!supabase) return;
    try {
      const { error } = await supabase.auth.signOut();
      if (error) { setNotice('Could not sign out: ' + error.message); return; }
      activeUserIdRef.current = null;
      setSession(null);
      setNotice('Signed out successfully.');
    } catch (error) {
      setNotice('Could not sign out: ' + (error instanceof Error ? error.message : 'Unexpected error.'));
    }
  }
  async function startFocus() {
    if (!supabase || !session || focusSaving) return;
    const actorId = session.user.id;
    if (focusRunId) {
      if (!focusPaused) return;
      setFocusSaving(true);
      try {
        const {error} = await supabase.rpc('resume_focus_session',{run_id:focusRunId});
        if (activeUserIdRef.current !== actorId) return;
        if (error) { setNotice('Could not resume focus session: '+error.message); return; }
        setFocusPaused(false);
        setFocusRunning(true);
      } catch (error) {
        if (activeUserIdRef.current === actorId) setNotice('Could not resume focus session: '+(error instanceof Error?error.message:'Unexpected error.'));
      } finally { if (activeUserIdRef.current === actorId) setFocusSaving(false); }
      return;
    }
    setFocusSaving(true);
    try {
      const mode = focusMode === 'Pomodoro' ? 'pomodoro' : focusMode === 'Deep Sprint' ? 'deep_sprint' : focusMode === 'Custom' ? 'custom' : 'extreme_grind';
      const {data,error} = mode === 'custom'
        ? await supabase.rpc('start_custom_focus_session',{subject_name:taskSubject,target_minutes:Math.max(1,Math.min(120,Math.floor(customFocusMinutes)))})
        : await supabase.rpc('start_focus_session',{subject_name:taskSubject,mode_name:mode});
      if (activeUserIdRef.current !== actorId) return;
      if (error) setNotice('Could not start focus session: '+error.message);
      else if (data && typeof (data as {session_id?:unknown}).session_id === 'string') {
        setFocusRunId((data as {session_id:string}).session_id);
        setFocusPaused(false);
        setFocusRunning(true);
        setFocusCompleted(false);
      } else setNotice('Could not start focus session: the server returned an unexpected response.');
    } catch (error) {
      if (activeUserIdRef.current === actorId) setNotice('Could not start focus session: '+(error instanceof Error?error.message:'Unexpected error.'));
    } finally {
      if (activeUserIdRef.current === actorId) setFocusSaving(false);
    }
  }
  async function pauseFocus() {
    if (!supabase || !session || !focusRunId || !focusRunning || focusSaving) return;
    const actorId = session.user.id;
    setFocusSaving(true);
    try {
      const {error} = await supabase.rpc('pause_focus_session',{run_id:focusRunId});
      if (activeUserIdRef.current !== actorId) return;
      if (error) { setNotice('Could not pause focus session: '+error.message); return; }
      setFocusPaused(true);
      setFocusRunning(false);
    } catch (error) {
      if (activeUserIdRef.current === actorId) setNotice('Could not pause focus session: '+(error instanceof Error?error.message:'Unexpected error.'));
    } finally { if (activeUserIdRef.current === actorId) setFocusSaving(false); }
  }
  async function resetFocus() {
    if (focusSaving) return;
    const actorId = session?.user.id ?? null;
    const wasRunning = focusRunning;
    setFocusSaving(true);
    setFocusRunning(false);
    try {
      if (supabase && focusRunId) {
        const {error} = await supabase.rpc('cancel_focus_session',{run_id:focusRunId});
        if (activeUserIdRef.current !== actorId) return;
        if (error) {
          setFocusRunning(wasRunning);
          setNotice('Could not reset session: '+error.message);
          return;
        }
      }
      setFocusRunId(null);
      setFocusPaused(false);
      setFocusCompleted(false);
      setFocusSeconds(focusMode==='Pomodoro'?1500:focusMode==='Deep Sprint'?3000:focusMode==='Custom'?customFocusMinutes*60:5400);
    } catch (error) {
      if (activeUserIdRef.current === actorId) {
        setFocusRunning(wasRunning);
        setNotice('Could not reset session: '+(error instanceof Error?error.message:'Unexpected error.'));
      }
    } finally {
      if (activeUserIdRef.current === actorId) setFocusSaving(false);
    }
  }
  async function settleFocus() {
    if (!supabase || !session || !focusCompleted || focusSaving) return;
    const actorId = session.user.id;
    const mode = focusMode === 'Pomodoro' ? 'pomodoro' : focusMode === 'Deep Sprint' ? 'deep_sprint' : focusMode === 'Custom' ? 'custom' : 'extreme_grind';
    if (!focusRunId) { setNotice('Start a focus session before claiming rewards.'); return; }
    setFocusSaving(true);
    try {
      const {data,error} = await supabase.rpc('complete_focus_session',{run_id:focusRunId});
      if (activeUserIdRef.current !== actorId) return;
      if (error) setNotice('Could not save focus session: '+error.message);
      else {
        const reward = data as {coins_earned?:number;xp_earned?:number};
        if (!Number.isFinite(reward?.coins_earned) || !Number.isFinite(reward?.xp_earned)) {
          setNotice('Could not save focus session: the server returned an unexpected reward response.');
        } else {
          // Re-read the authoritative balance after the reward RPC commits.
          // This avoids drifting local state if an operator adjusted the wallet concurrently.
          const {data:wallet,error:walletError} = await supabase.from('wallets').select('coins').eq('user_id',actorId).maybeSingle();
          if (activeUserIdRef.current !== actorId) return;
          if (!walletError && wallet && Number.isFinite(Number(wallet.coins))) setCoins(Number(wallet.coins));
          else setCoins(v=>v+Number(reward.coins_earned));
          setFocusCompleted(false);
          setFocusRunId(null);
          setFocusPaused(false);
          setFocusSeconds(mode==='pomodoro'?1500:mode==='deep_sprint'?3000:mode==='custom'?customFocusMinutes*60:5400);
          setNotice('Session saved · +'+reward.coins_earned+' Ascend OS Coins · +'+reward.xp_earned+' XP');
        }
      }
    } catch (error) {
      if (activeUserIdRef.current === actorId) setNotice('Could not save focus session: '+(error instanceof Error?error.message:'Unexpected error.'));
    } finally {
      if (activeUserIdRef.current === actorId) setFocusSaving(false);
    }
  }
  if (!bootIntroDone) return <div className="boot-cinema boot-cinema-input-lock" role="status" aria-label="Loading Ascend OS">
    <video className="boot-cinema-video" src={ascendBootVideo} autoPlay muted playsInline preload="auto" aria-hidden="true" onEnded={() => setBootIntroDone(true)} onError={() => setBootIntroDone(true)} />
    <div className="boot-cinema-vignette" />
    <div className="boot-cinema-status"><span className="boot-cinema-status-dot" /> ASCEND OS <i /> INITIALIZING</div>
    
  </div>;
  if (!authReady) return <div className="boot"><div className="brand-mark"><img className="ascend-logo-image" src={ascendLogo} alt="Ascend OS logo" /></div><span>INITIALIZING ASCEND OS</span></div>;
  if (!session) return <AuthScreen email={email} setEmail={setEmail} password={password} setPassword={setPassword} authMode={authMode} setAuthMode={setAuthMode} signIn={signIn} busy={authBusy} message={authMessage} />;
  if (session && supabase && !profileLoaded) return <div className="boot"><div className="brand-mark"><img className="ascend-logo-image" src={ascendLogo} alt="Ascend OS logo" /></div><span>LOADING YOUR WORKSPACE</span></div>;
  if (session && supabase && profile && !profile.school_target) return <Onboarding supabase={supabase} profile={profile} userId={session.user.id} onSaved={(next) => { setProfile(next); setNotice('Welcome to Ascend OS. Your workspace is ready.'); }} />;
  const canToggleOperator = session.user.email?.toLowerCase() === 'astryxleo@gmail.com' && Boolean(session.user.email_confirmed_at);
  const isOperator = canToggleOperator ? operatorMode : profile?.role === 'operator';
  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav?'sidebar-open':''}`}>
      <div className="brand"><div className="brand-mark"><img className="ascend-logo-image" src={ascendLogo} alt="Ascend OS logo" /></div><div><strong>ASCEND OS</strong><span>STUDY OPERATING SYSTEM</span></div><button className="icon-btn mobile-close" onClick={()=>setMobileNav(false)} aria-label="Close navigation"><X size={17}/></button></div>
      <div className="sidebar-navigation">
        <div className="workspace-label">WORKSPACE <ChevronDown size={12}/></div>
        <div className="nav-list">{nav.map(item=><button key={item.label} className={`nav-item ${activeNav===item.label?'active':''}`} onClick={()=>{navigate(item.label);setMobileNav(false);}}><item.icon size={17}/><span>{item.label}</span>{item.label==='Focus room'&&<span className="nav-dot"/>}</button>)}</div>
        {isOperator&&<><div className="workspace-label operator-label">OPERATOR</div><button className={`nav-item ${activeNav==='Control center'?'active':''}`} onClick={()=>{navigate('Control center');setMobileNav(false);}}><ShieldCheck size={17}/><span>Control center</span><span className="operator-chip">ROOT</span></button></>}
      </div>
      <div className="sidebar-bottom"><div className="streak-card"><div className="streak-icon"><Flame size={17}/></div><div><b>Build your streak</b><span>One session at a time.</span></div><ArrowUpRight size={15}/></div><button className="nav-item" onClick={()=>navigate('Settings')}><Settings2 size={17}/><span>Settings</span></button><div className="user-card"><div className="avatar">{profile?.avatar_url?<img src={profile.avatar_url} alt="" />:(profile?.full_name||session.user.email||'L').slice(0,1).toUpperCase()}</div><div className="user-meta"><b>{profile?.full_name||session.user.user_metadata?.full_name||'Student'}</b><span>{isOperator?'OPERATOR ACCESS':'CLASS XII · STUDENT'}</span></div><button className="icon-btn" title="Sign out" onClick={signOut}><LogOut size={16}/></button></div></div>
    </aside>
    {mobileNav&&<button className="scrim" onClick={()=>setMobileNav(false)} aria-label="Close menu"/>}
    <main className="main-area">
      <header className="topbar"><div className="top-left"><button className="icon-btn menu-toggle" onClick={()=>setMobileNav(true)} aria-label="Open navigation"><Menu size={19}/></button><div className="breadcrumb">Workspace <span>/</span> <b>{activeNav}</b></div></div><div className="top-actions"><div className="status-pill"><span/> SYSTEM ONLINE</div><div className="coin-pill"><span>◈</span>{coins.toLocaleString()} <small>ASCEND</small></div>{canToggleOperator&&<button type="button" className="secondary-btn operator-mode-toggle" aria-pressed={operatorMode} onClick={()=>{const nextMode=!operatorMode;setOperatorMode(nextMode);navigate(nextMode?'Control center':'Overview');setNotice(nextMode?'Operator Mode enabled.':'Student Mode restored.');}} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:7,whiteSpace:'nowrap',padding:'9px 12px',fontSize:12}}>{operatorMode?<GraduationCap size={15}/>:<ShieldCheck size={15}/>} {operatorMode?'Student Mode':'Operator Mode'}</button>}<button className="icon-btn help-trigger" title="Open the Ascend OS tutorial" aria-label="Help and tutorial" onClick={openTutorial}><CircleHelp size={17}/></button></div></header>
      <div className="content">
        <div className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-line"/> YOUR PERSONAL COMMAND DECK</div><h1>{greeting}, <em>{(profile?.full_name||session.user.user_metadata?.full_name||'Scholar').split(' ')[0]}.</em></h1><p>Your ambition, measured in focused minutes.</p></div><div className="date-chip"><div className="date-dot"/>{new Date().toLocaleDateString('en-IN',{weekday:'short',day:'2-digit',month:'short',year:'numeric'})}</div></div>
        {notice&&<div className="notice"><Sparkles size={15}/>{notice}<button onClick={()=>setNotice('')} aria-label="Dismiss"><X size={14}/></button></div>}
        {activeNav==='Overview'&&<Overview tasks={tasks} done={done} percent={percent} syllabusPercent={totalSyllabusSteps?Math.min(100,Math.round(completedSteps/totalSyllabusSteps*100)):0} focusSeconds={focusSeconds} fmt={fmt} setFocusSeconds={setFocusSeconds} focusRunning={focusRunning} setFocusRunning={setFocusRunning} focusMode={focusMode} setFocusMode={setFocusMode} customFocusMinutes={customFocusMinutes} navigate={navigate} completedSteps={completedSteps} coins={coins} startFocus={startFocus} resetFocus={resetFocus} pauseFocus={pauseFocus} focusPaused={focusPaused} focusCompleted={focusCompleted} focusSaving={focusSaving} sessionActive={!!focusRunId} openFocusPictureInPicture={openFocusPictureInPicture} />}
        {activeNav==='Planner'&&<section className="panel task-panel"><div className="section-heading"><div><span className="eyebrow">DAILY EXECUTION · 4 AM IST RESET</span><h2>Study board</h2></div><button className="primary-btn" onClick={()=>setNewTaskOpen(v=>!v)}><Plus size={16}/> New task</button></div><div className="planner-command-banner"><div><span className="eyebrow">YOUR EXECUTION SYSTEM</span><h3>Turn intention into <em>momentum.</em></h3><p>Build a realistic plan, protect your energy, and stack small wins.</p></div><div className="planner-focus-score"><span>DAILY SCORE</span><b>{percent}<small>/100</small></b><div className="planner-score-track"><i style={{width:percent+'%'}}/></div></div></div><div className="planner-stat-grid"><div className="planner-stat-card"><span>TASKS PLANNED</span><b>{tasks.length.toString().padStart(2,'0')}</b><small><Target size={13}/> today's commitments</small></div><div className="planner-stat-card"><span>COMPLETED</span><b>{done.toString().padStart(2,'0')}</b><small><Check size={13}/> wins locked in</small></div><div className="planner-stat-card"><span>TIME ALLOCATED</span><b>{Math.round(tasks.reduce((n,t)=>n+(t.estimated_minutes||25),0)/60*10)/10}<small>h</small></b><small><Clock3 size={13}/> estimated deep work</small></div><div className="planner-stat-card"><span>HIGH PRIORITY</span><b>{tasks.filter(t=>t.priority==='P1'&&!t.completed).length.toString().padStart(2,'0')}</b><small><Flame size={13}/> still on the board</small></div></div><div className="planner-datebar"><button onClick={()=>{setPlannerDay(shiftStudyDay(plannerDay,-1));}}>← Previous</button><label>Study day<input type="date" value={plannerDay} max={studyDay()} onChange={e=>e.target.value&&e.target.value<=studyDay()&&setPlannerDay(e.target.value)}/></label><button disabled={plannerDay===studyDay()} onClick={()=>setPlannerDay(studyDay())}>Today ↗</button></div><div className="progress-row"><span>{done} of {tasks.length} tasks complete</span><b>{percent}%</b></div><div className="progress-track"><div style={{width:percent+'%'}}/></div>{tasks.length?<TaskList tasks={tasks} toggleTask={toggleTask}/>:<div className="planner-empty">{plannerDay===studyDay()?'No tasks planned yet. Add one small win.':'No archived tasks for this study day.'}</div>}{newTaskOpen&&<form className="task-form" onSubmit={addTask}><input value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} placeholder="What will you work on?" autoFocus/><select value={taskSubject} onChange={e=>setTaskSubject(e.target.value)}>{subjects.map(s=><option key={s}>{s}</option>)}</select><select value={taskPriority} onChange={e=>setTaskPriority(e.target.value as 'P1'|'P2'|'P3')}><option value="P1">P1 · High</option><option value="P2">P2 · Normal</option><option value="P3">P3 · Low</option></select><button className="primary-btn" type="submit">Add task</button></form>}</section>}
        {activeNav==='Focus room'&&<FocusRoom focusSeconds={focusSeconds} fmt={fmt} setFocusSeconds={setFocusSeconds} focusRunning={focusRunning} focusMode={focusMode} setFocusMode={setFocusMode} customFocusMinutes={customFocusMinutes} setCustomFocusMinutes={setCustomFocusMinutes} focusCompleted={focusCompleted} settleFocus={settleFocus} focusSaving={focusSaving} startFocus={startFocus} resetFocus={resetFocus} pauseFocus={pauseFocus} focusPaused={focusPaused} sessionActive={!!focusRunId}/>}
        {activeNav==='Syllabus'&&<Syllabus supabase={supabase} userId={session?.user.id??null} completedSteps={completedSteps} setCompletedSteps={setCompletedSteps} setNotice={setNotice}/>}
        {activeNav==='Exams & marks'&&<ExamCommand supabase={supabase} userId={session?.user.id??null} setNotice={setNotice}/>}
        {activeNav==='Updates'&&<UpdatesPanel supabase={supabase}/>}
        {activeNav==='Leaderboard'&&<LeaderboardPanel supabase={supabase} userId={session?.user.id??''}/>}
        {activeNav==='Combat Arena'&&<CombatPanel supabase={supabase} userId={session.user.id} setNotice={setNotice}/>}
        {activeNav==='Duels'&&<AnalyticsPanel supabase={supabase} userId={session.user.id} initialTab="duels"/>}
        {activeNav==='Squads'&&<SquadPanel supabase={supabase} userId={session.user.id} setNotice={setNotice}/>}
        {activeNav==='Achievements'&&<AchievementsPanel supabase={supabase} userId={session.user.id}/>}
        {activeNav==='Analytics'&&<AnalyticsPanel supabase={supabase} userId={session.user.id} initialTab="analytics"/>}
        {activeNav==='Control center'&&isOperator&&<OperatorPanel supabase={supabase} setNotice={setNotice}/>}
        {activeNav==='Settings'&&<SettingsPanel supabase={supabase} profile={profile} userId={session.user.id} onSaved={setProfile} setNotice={setNotice}/>}
        <footer className="footer"><span>◈ ASCEND OS <i>STUDY OS</i></span><span>BUILT FOR THE LONG GAME <span className="footer-dot">●</span></span></footer>
      </div>
    </main>
    {showTutorialNudge&&<div className="tutorial-nudge-backdrop"><section className="tutorial-nudge" role="dialog" aria-modal="true" aria-labelledby="tutorial-nudge-title"><div className="tutorial-nudge-icon"><CircleHelp size={24}/></div><span className="eyebrow">FIRST TIME HERE?</span><h2 id="tutorial-nudge-title">Your command deck, decoded.</h2><p>We recommend taking the quick tutorial once. It shows you where your syllabus, focus timer, planner, squads, duels, combat and leaderboards live.</p><div className="tutorial-nudge-actions"><button className="primary-btn" onClick={openTutorial}>Take the tutorial <ArrowUpRight size={15}/></button><button className="secondary-btn" onClick={markTutorialSeen}>I’ll explore myself</button></div><small>This reminder appears only once. The ? help button stays available anytime.</small></section></div>}
    {helpOpen&&<div className="tutorial-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setHelpOpen(false)}}><section className="tutorial-modal" role="dialog" aria-modal="true" aria-labelledby="tutorial-title"><header><div><span className="eyebrow">ASCEND OS · FIELD MANUAL</span><h2 id="tutorial-title">Your guide to Ascend.</h2><p>Everything you need to turn study effort into visible progress.</p></div><button className="icon-btn" onClick={()=>setHelpOpen(false)} aria-label="Close tutorial"><X size={18}/></button></header><div className="tutorial-grid"><article><span><LayoutDashboard size={18}/></span><b>Overview</b><p>Your command deck: daily execution, syllabus completion, wallet and focus timer. Use the blue floating-focus icon to keep a mini timer above other tabs.</p></article><article><span><BookOpen size={18}/></span><b>Syllabus</b><p>Open subjects and chapters, tick completed checkpoints and track your overall completion percentage.</p></article><article><span><Target size={18}/></span><b>Planner</b><p>Add tasks, set priorities, mark work complete and review your daily execution score.</p></article><article><span><Focus size={18}/></span><b>Focus room</b><p>Choose Pomodoro, Deep Sprint, Extreme Grind or a custom session. Start, pause or resume; when time ends, return to claim your saved session rewards.</p></article><article><span><Trophy size={18}/></span><b>Leaderboards</b><p>Compare army size, coins, combat power, focus time, syllabus checkpoints, completed tasks and squads using live rankings.</p></article><article><span><Swords size={18}/></span><b>Combat & Duels</b><p>Grow your army and fighter stats. Duels compare study performance and combat strength with another student.</p></article><article><span><Users size={18}/></span><b>Squads</b><p>Create or join a private squad, open its dashboard, check member rankings and analytics, upgrade squad attributes and launch or manage team challenges.</p></article><article><span><ChartNoAxesColumn size={18}/></span><b>Analytics</b><p>Review focus trends, task completion and syllabus mastery. Hover or tap chart points to inspect values.</p></article><article><span><Award size={18}/></span><b>Achievements & Settings</b><p>Achievements celebrate milestones. Settings keeps your profile and preferences up to date.</p></article></div><div className="tutorial-footer"><span><ShieldCheck size={15}/> Rankings use saved activity and can update as stats sync.</span><button className="primary-btn" onClick={()=>setHelpOpen(false)}>Got it — let’s ascend <ArrowUpRight size={15}/></button></div></section></div>}
    {focusPipWindow&&createPortal(<div className="focus-pip-card" style={{minHeight:'100vh',padding:18,background:'radial-gradient(circle at 90% 0%,#1d4ed833,transparent 48%),linear-gradient(145deg,#101522,#080a10)',display:'flex',flexDirection:'column',gap:12,color:'#f8fafc'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}><div style={{display:'flex',alignItems:'center',gap:8}}><span style={{width:30,height:30,borderRadius:10,display:'grid',placeItems:'center',background:'#2563eb30',color:'#60a5fa'}}><Focus size={17}/></span><div><b style={{fontSize:12,letterSpacing:'.08em'}}>ASCEND FOCUS</b><div style={{fontSize:9,color:'#8c98ad',letterSpacing:'.13em'}}>{focusRunning?'SESSION LIVE':focusCompleted?'FOCUS COMPLETE':focusPaused?'PAUSED':'READY'}</div></div></div><button onClick={()=>focusPipWindow.close()} title="Close floating timer" style={{border:'1px solid #ffffff1a',borderRadius:8,background:'#ffffff08',color:'#cbd5e1',padding:'5px 9px',cursor:'pointer'}}>×</button></div>
      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:3}}><strong style={{fontSize:47,fontVariantNumeric:'tabular-nums',letterSpacing:'-.06em',lineHeight:1.05,color:focusCompleted?'#86efac':'#f8fafc'}}>{fmt(focusSeconds)}</strong><span style={{fontSize:9,color:'#94a3b8',letterSpacing:'.18em'}}>{focusMode.toUpperCase()} · {focusCompleted?'YOU SHOWED UP · TAKE A BREATH':focusPaused?'PAUSED':'PROTECT YOUR FOCUS'}</span></div>
      {focusCompleted?<button onClick={()=>{focusPipWindow.close();navigate('Focus room');}} style={{border:0,borderRadius:10,padding:11,background:'linear-gradient(100deg,#2563eb,#38bdf8)',color:'#fff',fontWeight:800,cursor:'pointer'}}>Time’s up · view session & claim XP</button>:<div style={{display:'flex',gap:8}}><button onClick={()=>{if(focusRunning)void pauseFocus();else void startFocus();}} disabled={focusSaving} style={{flex:1,border:0,borderRadius:10,padding:10,background:'linear-gradient(100deg,#2563eb,#38bdf8)',color:'#fff',fontWeight:800,cursor:'pointer'}}>{focusRunning?'Pause':focusPaused?'Resume':focusRunId?'Continue':'Start focus'}</button><button onClick={()=>void resetFocus()} disabled={focusSaving} style={{border:'1px solid #ffffff20',borderRadius:10,padding:'10px 13px',background:'#ffffff08',color:'#cbd5e1',cursor:'pointer'}}>Reset</button></div>}
      <div style={{fontSize:9,color:'#6f7b91',textAlign:'center'}}>ALWAYS-ON-TOP WINDOW · TIMER STAYS WITH YOU</div>
    </div>,focusPipWindow.document.body)}
  </div>;
}
function AuthScreen({email,setEmail,password,setPassword,authMode,setAuthMode,signIn,busy,message}:{email:string;setEmail:(s:string)=>void;password:string;setPassword:(s:string)=>void;authMode:'login'|'signup';setAuthMode:(s:'login'|'signup')=>void;signIn:()=>void;busy:boolean;message:string}) {
 return <div className="auth-shell"><div className="auth-ambient ambient-one"/><div className="auth-ambient ambient-two"/><div className="auth-card"><div className="brand auth-brand"><div className="brand-mark"><img className="ascend-logo-image" src={ascendLogo} alt="Ascend OS logo" /></div><div><strong>ASCEND OS</strong><span>STUDY OPERATING SYSTEM</span></div></div><div className="auth-kicker"><span/> YOUR NEXT CHAPTER STARTS HERE</div><h1>Make focus<br/>your <em>superpower.</em></h1><p className="auth-copy">One place for your syllabus, deep work, and the future you're building.</p><div className="auth-tabs"><button type="button" className={authMode==='login'?'selected':''} onClick={()=>setAuthMode('login')}>Log in</button><button type="button" className={authMode==='signup'?'selected':''} onClick={()=>setAuthMode('signup')}>Create account</button></div><label className="field-label">EMAIL ADDRESS<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required/></label><label className="field-label">PASSWORD<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete={authMode==='signup'?'new-password':'current-password'} minLength={8} required/></label><button className="auth-submit" onClick={signIn} disabled={busy}>{busy?(authMode==='signup'?'Creating account…':'Signing in…'):authMode==='signup'?'Create free account':'Log in'} <ArrowUpRight size={16}/></button>{message&&<div className="auth-message" role="status">{message}</div>}<div className="auth-security"><ShieldCheck size={15}/> Your study data stays private to your account.</div><div className="auth-foot">FREE TO USE <span>·</span> POWERED BY YOU</div></div></div>;
}
function Overview({tasks,done,percent,syllabusPercent,focusSeconds,fmt,setFocusSeconds,focusRunning,setFocusRunning,focusMode,setFocusMode,customFocusMinutes,navigate,completedSteps,coins,startFocus,resetFocus,pauseFocus,focusPaused,focusCompleted,focusSaving,sessionActive,openFocusPictureInPicture}:{tasks:Task[];done:number;percent:number;syllabusPercent:number;focusSeconds:number;fmt:(s:number)=>string;setFocusSeconds:(s:number)=>void;focusRunning:boolean;setFocusRunning:(b:boolean)=>void;focusMode:string;setFocusMode:(s:string)=>void;customFocusMinutes:number;navigate:(s:string)=>void;completedSteps:number;coins:number;startFocus:()=>void;resetFocus:()=>void;pauseFocus:()=>void;focusPaused:boolean;focusCompleted:boolean;focusSaving:boolean;sessionActive:boolean;openFocusPictureInPicture:()=>void}) {
 const remaining=tasks.length-done;
 return <><section className="ascend-hero">
 <div className="ascend-hero-orb ascend-orb-one"/><div className="ascend-hero-orb ascend-orb-two"/><div className="ascend-hero-grid"/>
 <div className="ascend-hero-copy"><div className="ascend-live-label"><span/> YOUR NEXT LEVEL STARTS NOW <Sparkles size={13}/></div>
 <h2>Make today <em>count.</em></h2><p>Small focused actions. Extraordinary outcomes.</p>
 <div className="ascend-hero-actions"><button className="ascend-cta" onClick={()=>navigate('Focus room')}><Flame size={16}/> Enter focus room <ArrowUpRight size={16}/></button><button className="ascend-ghost-cta" onClick={()=>navigate('Planner')}><Target size={15}/> Plan your day</button></div></div>
 <div className="ascend-hero-art" aria-hidden="true"><div className="ascend-orbit orbit-a"/><div className="ascend-orbit orbit-b"/><div className="ascend-core"><div className="ascend-core-inner">A<span>✦</span></div></div><div className="ascend-orbit-dot dot-a"/><div className="ascend-orbit-dot dot-b"/><div className="ascend-orbit-dot dot-c"/><div className="ascend-art-caption">ASCEND <span>•</span> EVOLVE</div></div>
 <div className="ascend-hero-footer"><div><span>DAILY EXECUTION</span><b>{percent}% <i>complete</i></b><div className="ascend-mini-track"><i style={{width:percent+'%'}}/></div></div><div><span>SYLLABUS CHECKPOINTS</span><b>{completedSteps.toLocaleString()} <i>completed</i></b><small className="hero-syllabus-percent">{syllabusPercent}% syllabus complete</small><div className="ascend-mini-track"><i style={{width:syllabusPercent+'%'}}/></div></div><div><span>STUDY ECONOMY</span><b>◈ {coins.toLocaleString()} <i>coins</i></b></div></div>
 </section><div className="metrics-grid"><Metric label="SYLLABUS MASTERY" value={syllabusPercent+'%'} note={completedSteps.toLocaleString()+' checkpoints completed'} icon={BookOpen} tone="cyan"/><Metric label="TODAY'S EXECUTION" value={percent+'%'} note={tasks.length?remaining+' tasks remaining':'No tasks planned yet'} icon={Target} tone="gold"/><Metric label="ASCEND OS BALANCE" value={coins.toLocaleString()} note="Your study economy" icon={Wallet} tone="crimson"/><Metric label="FOCUS STREAK" value="—" suffix="days" note="Consistency compounds" icon={Flame} tone="violet"/></div><div className="dashboard-grid"><section className="focus-card"><div className="focus-card-top"><div><span className="eyebrow">DEEP WORK PROTOCOL</span><h2>Enter the zone.</h2><p>Protect your attention. Let the rest wait.</p></div><button type="button" className="focus-symbol focus-float-trigger" onClick={openFocusPictureInPicture} title="Open always-on-top floating focus timer" aria-label="Open floating focus timer"><Focus size={21}/><span className="focus-float-hint">FLOAT TIMER</span></button></div><div className="focus-modes">{['Pomodoro','Deep Sprint','Extreme Grind'].map(m=><button key={m} disabled={sessionActive} className={focusMode===m?'chosen':''} onClick={()=>{setFocusMode(m);setFocusRunning(false);void resetFocus();setFocusSeconds(m==='Pomodoro'?1500:m==='Deep Sprint'?3000:5400);}}>{m}</button>)}</div><div className="timer-face"><div className="timer-ring"><svg viewBox="0 0 220 220"><circle cx="110" cy="110" r="99" className="ring-bg"/><circle cx="110" cy="110" r="99" className="ring-progress" strokeDasharray="622" strokeDashoffset={622*(1-Math.max(0,Math.min(1,focusSeconds/(focusMode==='Pomodoro'?1500:focusMode==='Deep Sprint'?3000:focusMode==='Extreme Grind'?5400:Math.max(1,Math.min(120,customFocusMinutes))*60))))}/></svg><div className="timer-content"><span>{focusRunning?'IN SESSION':'READY WHEN YOU ARE'}</span><strong>{fmt(focusSeconds)}</strong><small>{focusMode.toUpperCase()}</small></div></div></div><div className="timer-controls"><button className="primary-btn" disabled={focusCompleted||focusSaving} onClick={()=>{if(focusRunning)void pauseFocus();else startFocus();}}>{focusRunning?'Pause session':sessionActive?(focusPaused?'Resume focus':'Continue focus'):'Start focus'} <ArrowUpRight size={15}/></button><button className="icon-btn reset-btn" disabled={focusSaving} onClick={resetFocus} title="Reset timer"><Activity size={17}/></button>{focusCompleted&&<button className="primary-btn" disabled={focusSaving} onClick={()=>navigate('Focus room')}>Claim completed session <ArrowUpRight size={15}/></button>}</div><div className="focus-note"><span/> TIMER RUNS WHILE YOU STAY IN THE ZONE</div></section><section className="panel daily-panel"><div className="section-heading"><div><span className="eyebrow">THE DAILY PLAN</span><h2>Today's priorities</h2></div><button className="text-btn" onClick={()=>navigate('Planner')}>View board <ArrowUpRight size={14}/></button></div><div className="daily-summary"><div className="summary-ring"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="27"/><circle cx="32" cy="32" r="27" style={{strokeDasharray:170,strokeDashoffset:170*(1-percent/100)}}/></svg><b>{percent}%</b></div><div><strong>{tasks.length?done+' of '+tasks.length+' completed':'Start with one task'}</strong><span>{tasks.length?'Small wins stack up.':'Build your plan for today.'}</span></div></div><TaskList tasks={tasks.slice(0,4)} toggleTask={()=>navigate('Planner')}/>{tasks.length===0&&<button className="empty-action" onClick={()=>navigate('Planner')}><Plus size={15}/> Add your first task</button>}<div className="panel-bottom-link" onClick={()=>navigate('Planner')}>OPEN DAILY PLANNER <ArrowUpRight size={14}/></div></section></div><div className="bottom-grid"><section className="panel subject-panel"><div className="section-heading"><div><span className="eyebrow">ACADEMIC ENGINE</span><h2>Your six pillars</h2></div><button className="text-btn" onClick={()=>navigate('Syllabus')}>Syllabus <ArrowUpRight size={14}/></button></div><div className="subject-list">{subjects.map((s,i)=><div className="subject-row" key={s}><div className={'subject-icon subject-'+i}>{['∑','ϟ','⚗','Aa','Py','◈'][i]}</div><div className="subject-name"><b>{s}</b><span>{['Calculus & algebra','Mechanics & electricity','Physical to organic','Flamingo, Vistas & writing','Python & problem solving','Theory & practical'][i]}</span></div><div className="subject-progress"><div><span/><span/><span/><span/><span/></div><small>START HERE</small></div><ArrowUpRight size={14} className="muted-arrow"/></div>)}</div></section><section className="panel signal-panel"><div className="section-heading"><div><span className="eyebrow">MOMENTUM SIGNAL</span><h2>Consistency wins.</h2></div><div className="signal-icon"><Gauge size={18}/></div></div><div className="signal-graph"><div className="graph-grid"><span/><span/><span/><span/></div><svg viewBox="0 0 360 110" preserveAspectRatio="none"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#63e5f5" stopOpacity=".22"/><stop offset="100%" stopColor="#63e5f5" stopOpacity="0"/></linearGradient></defs><path d="M0,94 C30,85 34,65 62,72 S100,91 126,58 S165,67 188,43 S226,61 250,30 S294,49 320,22 S344,29 360,8 L360,110 L0,110 Z" fill="url(#area)"/><path d="M0,94 C30,85 34,65 62,72 S100,91 126,58 S165,67 188,43 S226,61 250,30 S294,49 320,22 S344,29 360,8" fill="none" stroke="#63e5f5" strokeWidth="2.2" vectorEffect="non-scaling-stroke"/></svg></div><div className="signal-footer"><div><b>YOUR NEXT SESSION</b><span>is the only one you need to win.</span></div><div className="signal-arrow"><ArrowUpRight size={18}/></div></div><div className="quote">“We are what we repeatedly do.”<span>— A REMINDER, NOT A DEADLINE</span></div></section></div></>;
}
function Metric({label,value,suffix,note,icon:Icon,tone}:{label:string;value:string;suffix?:string;note:string;icon:any;tone:string}) { return <div className="metric-card"><div className="metric-top"><span>{label}</span><div className={'metric-icon '+tone}><Icon size={16}/></div></div><div className="metric-value">{value}<small>{suffix}</small></div><div className="metric-note"><span className="metric-dot"/> {note}</div></div>; }
function TaskList({tasks,toggleTask}:{tasks:Task[];toggleTask:(task:Task)=>void}) { return <div className="task-list">{tasks.map(task=><div className={'task-row '+(task.completed?'task-done':'')} key={task.id}><button className={'task-check '+(task.completed?'checked':'')} onClick={()=>toggleTask(task)} aria-label={task.completed?'Mark incomplete':'Mark complete'}>{task.completed&&<Check size={12}/>}</button><div className="task-info"><b>{task.title}</b><span>{task.subject||'General study'}</span></div><span className={'priority '+task.priority.toLowerCase()}>{task.priority}</span></div>)}</div>; }
function FocusRoom({focusSeconds,fmt,setFocusSeconds,focusRunning,focusMode,setFocusMode,customFocusMinutes,setCustomFocusMinutes,focusCompleted,settleFocus,focusSaving,startFocus,resetFocus,pauseFocus,focusPaused,sessionActive}:{focusSeconds:number;fmt:(s:number)=>string;setFocusSeconds:(s:number)=>void;focusRunning:boolean;focusMode:string;setFocusMode:(s:string)=>void;customFocusMinutes:number;setCustomFocusMinutes:(n:number)=>void;focusCompleted:boolean;settleFocus:()=>void;focusSaving:boolean;startFocus:()=>void;resetFocus:()=>void;pauseFocus:()=>void;focusPaused:boolean;sessionActive:boolean}) {
 const [intention,setIntention]=useState('');
 const chooseMode=(m:string)=>{if(sessionActive)return;setFocusMode(m);void resetFocus();setFocusSeconds(m==='Pomodoro'?1500:m==='Deep Sprint'?3000:m==='Extreme Grind'?5400:Math.max(1,Math.min(120,customFocusMinutes))*60);};
 const totalSeconds=focusMode==='Pomodoro'?1500:focusMode==='Deep Sprint'?3000:focusMode==='Extreme Grind'?5400:Math.max(1,Math.min(120,customFocusMinutes))*60;
 const progress=Math.max(0,Math.min(100,(1-focusSeconds/totalSeconds)*100));
 return <section className="focus-room panel focus-command-room"><div className="focus-room-glow" aria-hidden="true"/><div className="focus-command-head"><div><span className="eyebrow">ASCEND PROTOCOL / 01</span><h2>Enter the <em>zone.</em></h2><p>Block the noise. Give one meaningful thing your full attention.</p></div><div className="focus-live-badge"><span className={focusRunning?'pulse':''}/>{focusRunning?'SESSION LIVE':sessionActive?'SESSION PAUSED':'READY TO BEGIN'}</div></div>
 <div className="focus-mode-deck">{[{name:'Pomodoro',time:'25 MIN',desc:'Build momentum'},{name:'Deep Sprint',time:'50 MIN',desc:'Sustained focus'},{name:'Extreme Grind',time:'90 MIN',desc:'Long-form work'},{name:'Custom',time:'YOUR TIME',desc:'Set your own pace'}].map((m,i)=><button className={'focus-mode-card '+(focusMode===m.name?'chosen':'')} key={m.name} disabled={sessionActive} onClick={()=>chooseMode(m.name)}><span className="focus-mode-index">0{i+1}</span><b>{m.name}</b><small>{m.desc}</small><strong>{m.time}</strong></button>)}</div>
 {focusMode==='Custom'&&<label className="field-label focus-custom-field">CUSTOM DURATION · 1–120 MINUTES<input type="number" min={1} max={120} step={1} value={customFocusMinutes} disabled={sessionActive} onChange={e=>{const raw=e.target.value;const n=Number(raw);if(raw!==''&&Number.isFinite(n)){const safe=Math.max(1,Math.min(120,Math.floor(n)));setCustomFocusMinutes(safe);if(!sessionActive&&!focusRunning)setFocusSeconds(safe*60);}}}/></label>}
 <div className="focus-command-layout"><div className="focus-timer-stage"><div className="focus-timer-orbit"/><div className="focus-timer-ring"><svg viewBox="0 0 260 260" aria-label={Math.round(progress)+' percent of focus session elapsed'}><circle className="focus-ring-track" cx="130" cy="130" r="113"/><circle className="focus-ring-progress" cx="130" cy="130" r="113" strokeDasharray="710" strokeDashoffset={710*(1-progress/100)}/></svg><div className="focus-timer-center"><span>{focusRunning?'DEEP WORK IN PROGRESS':'YOUR NEXT LEVEL AWAITS'}</span><strong>{fmt(focusSeconds)}</strong><small>{focusMode.toUpperCase()} · {Math.round(progress)}% ELAPSED</small></div></div><div className="focus-timer-foot"><span><i/> DISTRACTIONS: MUTED</span><span>PROTOCOL {focusMode==='Pomodoro'?'25':focusMode==='Deep Sprint'?'50':focusMode==='Extreme Grind'?'90':customFocusMinutes} MIN</span></div></div>
 <div className="focus-intention-panel"><span className="eyebrow">MISSION BRIEF</span><h3>What will you move forward?</h3><p>Choose one clear outcome. You don't need to finish everything—just make progress.</p><label className="focus-intention-label">SESSION INTENTION<textarea value={intention} onChange={e=>setIntention(e.target.value)} maxLength={240} placeholder="e.g. Solve 12 integration questions…"/></label><div className="focus-intention-note"><Sparkles size={15}/> {intention.trim()?'Your mission is defined. Protect this block.':'A clear intention makes it easier to start.'}</div><div className="timer-controls focus-command-controls"><button className="primary-btn" disabled={focusCompleted||focusSaving} onClick={()=>{if(focusRunning)void pauseFocus();else startFocus();}}>{focusRunning?'Pause session':sessionActive?(focusPaused?'Resume focus':'Continue focus'):'Start focus session'} <ArrowUpRight size={15}/></button><button className="secondary-btn" disabled={focusSaving} onClick={resetFocus}>Reset</button></div>{focusCompleted&&<button className="primary-btn focus-claim" disabled={focusSaving} onClick={settleFocus}>{focusSaving?'Saving session…':'Complete mission · claim coins'}</button>}</div></div>
 <div className="focus-session-foot"><div><Clock3 size={16}/><span><b>Server-synced timer</b><small>Elapsed time catches up when you return to the page.</small></span></div><div><ShieldCheck size={16}/><span><b>One session at a time</b><small>Choose your protocol and protect your attention.</small></span></div><div><Wallet size={16}/><span><b>Earn as you focus</b><small>Save a completed session to claim study rewards.</small></span></div></div></section>;
}
type SyllabusStep = {id:string;subject_id:string;chapter_id:string;chapter_title:string;chapter_order:number;step_title:string;step_order:number};
type SyllabusProgress = {subject_id:string;chapter_id:string;step_id:string;completed:boolean};
function Syllabus({supabase,userId,completedSteps,setCompletedSteps,setNotice}:{supabase:SupabaseClient|null;userId:string|null;completedSteps:number;setCompletedSteps:Dispatch<SetStateAction<number>>;setNotice:(s:string)=>void}) {
 const activeUserIdRef=useRef<string|null>(userId);
 activeUserIdRef.current=userId;
 const [steps,setSteps]=useState<SyllabusStep[]>([]);
 const [progress,setProgress]=useState<Record<string,boolean>>({});
 const [selectedSubject,setSelectedSubject]=useState('mathematics');
 const [expanded,setExpanded]=useState<Record<string,boolean>>({});
 const [loading,setLoading]=useState(true);
 const [loadError,setLoadError]=useState<string|null>(null);
 const [reloadKey,setReloadKey]=useState(0);
 const [saving,setSaving]=useState<string|null>(null);
 const savingLockRef=useRef<string|null>(null);
 const progressCountRequestRef=useRef(0);
 const [filter,setFilter]=useState<'all'|'incomplete'|'complete'>('all');
 const [search,setSearch]=useState('');
 useEffect(()=>{
  // Never show the previous account's syllabus/progress while a new account loads.
  setSteps([]);
  setProgress({});
  setSaving(null);
  savingLockRef.current=null;
  progressCountRequestRef.current+=1;
  setCompletedSteps(0);
  setLoading(true);
  setLoadError(null);
  if(!supabase||!userId){setLoading(false);setSteps([]);setProgress({});setCompletedSteps(0);return;}
  let alive=true;
  (async()=>{
   setLoading(true);
   try {
    const [catalog,owned]=await Promise.all([
     supabase.from('syllabus_steps').select('id,subject_id,chapter_id,chapter_title,chapter_order,step_title,step_order').eq('is_published',true).order('chapter_order').order('step_order'),
     supabase.from('chapter_progress').select('subject_id,chapter_id,step_id,completed').eq('user_id',userId)
    ]);
    if(!alive)return;
    let loadProblem:string|null=null;
    if(catalog.error){loadProblem='Could not load syllabus: '+catalog.error.message;setSteps([]);}
    else setSteps((catalog.data??[]) as SyllabusStep[]);
    if(owned.error){
     setProgress({});
     setCompletedSteps(0);
     loadProblem=[loadProblem,'Could not load saved progress: '+owned.error.message].filter(Boolean).join(' ');
    } else {const ownedRows=(owned.data??[]) as SyllabusProgress[];const map:Record<string,boolean>={};ownedRows.forEach(p=>{map[p.step_id]=p.completed});setProgress(map);setCompletedSteps(ownedRows.filter(p=>p.completed).length);}
    if(loadProblem){setLoadError(loadProblem);setNotice(loadProblem);}else setLoadError(null);
   } catch(reason) {
    if(alive){
     setSteps([]);
     setProgress({});
     setCompletedSteps(0);
     const message='Could not load syllabus because of a network error. Please retry.';
     setLoadError(message);
     setNotice(message);
    }
   } finally {
    if(alive)setLoading(false);
   }
  })();
  const channel=supabase.channel('syllabus-progress-'+userId).on('postgres_changes',{event:'*',schema:'public',table:'chapter_progress',filter:'user_id=eq.'+userId},payload=>{
   const row=(payload.new??payload.old) as SyllabusProgress;
   if(!alive||activeUserIdRef.current!==userId||!row?.step_id)return;
   const after=payload.eventType==='DELETE'?false:!!(payload.new as SyllabusProgress).completed;
   setProgress(prev=>({...prev,[row.step_id]:after}));
   const refreshUserId=userId;
   const requestVersion=++progressCountRequestRef.current;
   void supabase.from('chapter_progress').select('step_id',{count:'exact',head:true}).eq('user_id',refreshUserId).eq('completed',true).then(({count,error})=>{
    if(alive&&activeUserIdRef.current===refreshUserId&&progressCountRequestRef.current===requestVersion&&!error&&typeof count==='number')setCompletedSteps(count);
   });
  }).subscribe();
  return()=>{alive=false;void supabase.removeChannel(channel);};
 },[supabase,userId,reloadKey,setCompletedSteps,setNotice]);
 const visibleSteps=steps.filter(s=>s.subject_id===selectedSubject);
 const chapters=Array.from(new Map(visibleSteps.map(s=>[s.chapter_id,{id:s.chapter_id,title:s.chapter_title}])).values()).filter(ch=>ch.title.toLowerCase().includes(search.toLowerCase())||visibleSteps.some(s=>s.chapter_id===ch.id&&s.step_title.toLowerCase().includes(search.toLowerCase())));
 async function toggle(step:SyllabusStep){
  if(!supabase||!userId){setNotice('Sign in to save syllabus progress.');return;}
  if(savingLockRef.current!==null)return;
  const actorId=userId;
  const next=!progress[step.id];
  savingLockRef.current=step.id;
  setSaving(step.id);
  try {
   const {error}=await supabase.from('chapter_progress').upsert({user_id:actorId,subject_id:step.subject_id,chapter_id:step.chapter_id,step_id:step.id,completed:next,completed_at:next?new Date().toISOString():null,updated_at:new Date().toISOString()},{onConflict:'user_id,subject_id,chapter_id,step_id'});
   if(activeUserIdRef.current!==actorId)return;
   if(error)setNotice('Progress was not saved: '+error.message);
   else {
    setProgress(prev=>({...prev,[step.id]:next}));
    setNotice(next?'Checkpoint completed and synced.':'Checkpoint marked incomplete.');
    const requestVersion=++progressCountRequestRef.current;
    void supabase.from('chapter_progress').select('step_id',{count:'exact',head:true}).eq('user_id',actorId).eq('completed',true).then(({count,error:countError})=>{
     if(activeUserIdRef.current===actorId&&progressCountRequestRef.current===requestVersion&&!countError&&typeof count==='number')setCompletedSteps(count);
    });
   }
  } catch(reason) {
   if(activeUserIdRef.current===actorId)setNotice('Progress could not be saved because of a network error. Please try again.');
  } finally {
   if(activeUserIdRef.current===actorId){savingLockRef.current=null;setSaving(null);}
  }
 }
 return <section className="panel syllabus-panel syllabus-workspace">
  <div className="section-heading"><div><span className="eyebrow">CLASS XII · NCERT</span><h2>Syllabus atlas</h2></div><span className="badge">6 SUBJECTS · {steps.length} CHECKPOINTS</span></div>
  <p className="muted-copy">Your checklist is saved to your account and syncs across sessions. Tick a checkpoint to update subject mastery.</p>
  <div className="syllabus-command-banner"><div className="syllabus-banner-orb"/><div><span className="eyebrow">THE KNOWLEDGE MAP</span><h3>Master the syllabus. <em>Own the exam.</em></h3><p>Every checkpoint is a small promise to your future self. Track what you know, find the gaps, and keep moving.</p></div><div className="syllabus-level-badge"><span>MASTERY</span><b>{steps.length?Math.round(completedSteps/steps.length*100):0}<small>%</small></b><div className="syllabus-level-track"><i style={{width:(steps.length?Math.min(100,completedSteps/steps.length*100):0)+'%'}}/></div></div></div><div className="syllabus-quick-stats"><div><span>CHECKPOINTS CLEARED</span><b>{completedSteps.toLocaleString()}</b><small>Knowledge secured</small></div><div><span>REMAINING CHECKPOINTS</span><b>{Math.max(0,steps.length-completedSteps).toLocaleString()}</b><small>Next wins to earn</small></div><div><span>SUBJECTS IN PLAY</span><b>{subjects.length.toString().padStart(2,'0')}</b><small>Six pillars of Class XII</small></div></div><div className="syllabus-overview"><div><span>OVERALL CHECKPOINTS</span><b>{completedSteps}<small> / {steps.length}</small></b></div><div className="syllabus-progress-track"><i style={{width:(steps.length?Math.min(100,completedSteps/steps.length*100):0)+'%'}}/></div><span>{steps.length?Math.round(completedSteps/steps.length*100):0}% overall completion</span></div>
  <div className="syllabus-grid">{subjects.map((s,i)=>{const sid=['mathematics','physics','chemistry','english-core','computer-science','yoga'][i];const own=steps.filter(x=>x.subject_id===sid);const done=own.filter(x=>progress[x.id]).length;return <button className={'syllabus-tile '+(selectedSubject===sid?'active':'')} key={sid} onClick={()=>setSelectedSubject(sid)}><div className={'subject-icon subject-'+i}>{['∑','ϟ','⚗','Aa','Py','◈'][i]}</div><b>{s}</b><span>{own.length?Math.round(done/own.length*100)+'% mastered': 'Curriculum loading'}</span><small>{done} / {own.length} checkpoints</small></button>})}</div>
  <div className="syllabus-tools"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search chapters or checkpoints…" aria-label="Search syllabus"/><div className="syllabus-filters">{(['all','incomplete','complete'] as const).map(f=><button key={f} className={filter===f?'chosen':''} onClick={()=>setFilter(f)}>{f==='all'?'All':f==='incomplete'?'To do':'Completed'}</button>)}</div></div>
  {loading?<div className="syllabus-empty">Loading your curriculum…</div>:loadError?<div className="syllabus-empty" role="alert">{loadError} <button type="button" onClick={()=>setReloadKey(value=>value+1)}>Retry</button></div>:!steps.length?<div className="syllabus-empty">No published syllabus checkpoints are available yet.</div>:chapters.map(ch=>{const items=visibleSteps.filter(s=>s.chapter_id===ch.id&&(s.step_title.toLowerCase().includes(search.toLowerCase())||ch.title.toLowerCase().includes(search.toLowerCase()))).filter(s=>filter==='all'||(filter==='complete'?!!progress[s.id]:!progress[s.id]));const total=visibleSteps.filter(s=>s.chapter_id===ch.id).length;const done=visibleSteps.filter(s=>s.chapter_id===ch.id&&progress[s.id]).length;if(!items.length)return null;const open=expanded[ch.id]??(search.length>0);return <div className="syllabus-chapter" key={ch.id}><button className="syllabus-chapter-head" onClick={()=>setExpanded(p=>({...p,[ch.id]:!open}))}><span><b>{ch.title}</b><small>{done}/{total} checkpoints complete</small></span><span className="chapter-progress"><i style={{width:(total?done/total*100:0)+'%'}}/></span><span className="chapter-chevron">{open?'−':'+'}</span></button>{open&&<div className="syllabus-step-list">{items.map(step=><label className={'syllabus-step '+(progress[step.id]?'is-done':'')} key={step.id}><input type="checkbox" checked={!!progress[step.id]} disabled={saving!==null} onChange={()=>void toggle(step)}/><span>{step.step_title}</span>{saving===step.id?<small>Saving…</small>:progress[step.id]?<small>DONE</small>:null}</label>)}</div>}</div>})}
 </section>;
}
type ExamRow={id:string;name:string;subject:string;exam_date:string;max_marks:number|null;obtained_marks:number|null};
function ExamCommand({supabase,userId,setNotice}:{supabase:SupabaseClient|null;userId:string|null;setNotice:(s:string)=>void}){
  const activeUserIdRef=useRef<string|null>(userId);activeUserIdRef.current=userId;
 const [rows,setRows]=useState<ExamRow[]>([]);const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);
 const [name,setName]=useState('');const [subject,setSubject]=useState(subjects[0]);const [date,setDate]=useState(()=>new Date(Date.now()+7*86400000).toLocaleDateString('en-CA'));const [max,setMax]=useState('100');const [obtained,setObtained]=useState('');
 useEffect(()=>{if(!supabase||!userId){setRows([]);setLoading(false);return;}let alive=true;setRows([]);setLoading(true);(async()=>{try{const {data,error}=await supabase.from('exams').select('*').eq('user_id',userId).order('exam_date',{ascending:true});if(!alive)return;if(error)setNotice('Could not load exams: '+error.message);else setRows((data??[]) as ExamRow[]);}catch{if(alive)setNotice('Could not load exams because of a network error. Please retry by reopening Exams & marks.');}finally{if(alive)setLoading(false);}})();return()=>{alive=false}},[supabase,userId,setNotice]);
 useEffect(()=>{if(!supabase||!userId)return;let alive=true;const channel=supabase.channel('exam-live-'+userId).on('postgres_changes',{event:'*',schema:'public',table:'exams',filter:'user_id=eq.'+userId},()=>{void supabase.from('exams').select('*').eq('user_id',userId).order('exam_date',{ascending:true}).then(({data,error})=>{if(alive&&activeUserIdRef.current===userId&&!error&&data)setRows(data as ExamRow[])});}).subscribe();return()=>{alive=false;void supabase.removeChannel(channel)}},[supabase,userId]);
  const upcoming=rows.filter(r=>new Date(r.exam_date).getTime()>=Date.now()&&r.obtained_marks===null);
 const marked=rows.filter(r=>r.obtained_marks!==null&&r.max_marks);
 const average=marked.length?Math.round(marked.reduce((n,r)=>n+(r.obtained_marks!/r.max_marks!)*100,0)/marked.length):null;
 async function add(e:FormEvent){e.preventDefault();if(!supabase||!userId||!name.trim()||!date)return;const actorId=userId;const mx=max?Number(max):null;const ob=obtained===''?null:Number(obtained);if(mx!==null&&(!Number.isFinite(mx)||mx<=0)||ob!==null&&(!Number.isFinite(ob)||ob<0||mx!==null&&ob>mx)){setNotice('Check marks: obtained marks must be between zero and maximum marks.');return;}setSaving(true);try{const {data,error}=await supabase.from('exams').insert({user_id:actorId,name:name.trim(),subject,exam_date:new Date(date+'T09:00:00+05:30').toISOString(),max_marks:mx,obtained_marks:ob}).select('*').single();if(activeUserIdRef.current!==actorId)return;if(error)throw error;setRows(p=>[...p,data as ExamRow].sort((a,b)=>a.exam_date.localeCompare(b.exam_date)));setName('');setObtained('');setNotice('Exam saved to your account.');}catch(error){if(activeUserIdRef.current===actorId)setNotice('Could not save exam: '+(error instanceof Error?error.message:'Network error. Please try again.'));}finally{if(activeUserIdRef.current===actorId)setSaving(false);}}
 async function saveMarks(row:ExamRow,value:string){if(!supabase||!userId)return;const actorId=userId;const ob=value===''?null:Number(value);if(ob!==null&&(ob<0||row.max_marks!==null&&ob>row.max_marks)){setNotice('Marks must be between zero and maximum marks.');return;}try{const {error}=await supabase.from('exams').update({obtained_marks:ob}).eq('id',row.id).eq('user_id',actorId);if(activeUserIdRef.current!==actorId)return;if(error)throw error;setRows(p=>p.map(r=>r.id===row.id?{...r,obtained_marks:ob}:r));setNotice('Exam marks updated.');}catch(error){if(activeUserIdRef.current===actorId)setNotice('Could not save marks: '+(error instanceof Error?error.message:'Network error. Please try again.'));}}
 const [pendingDelete,setPendingDelete]=useState<ExamRow|null>(null);
 async function remove(row:ExamRow){setPendingDelete(row);}
 async function confirmDelete(){const row=pendingDelete;if(!supabase||!userId||!row)return;const actorId=userId;try{const {error}=await supabase.from('exams').delete().eq('id',row.id).eq('user_id',actorId);if(activeUserIdRef.current!==actorId)return;if(error)throw error;setRows(p=>p.filter(r=>r.id!==row.id));setNotice('Exam deleted.');}catch(error){if(activeUserIdRef.current===actorId)setNotice('Could not delete exam: '+(error instanceof Error?error.message:'Network error. Please try again.'));}finally{setPendingDelete(null);}}
 return <section className="panel exam-command"><div className="section-heading"><div><span className="eyebrow">ACADEMIC PERFORMANCE</span><h2>Exam command</h2></div><span className="badge">{rows.length} EXAMS</span></div><div className="exam-command-banner"><div><span className="eyebrow">PERFORMANCE INTELLIGENCE</span><h3>Measure progress. <em>Build confidence.</em></h3><p>Your marks are feedback, not your identity. Use every result to choose the next move.</p></div><div className="exam-grade-orb"><span>AVERAGE</span><b>{average===null?'—':average+'%'}</b><small>{average===null?'AWAITING RESULTS':average>=90?'EXCELLENT MOMENTUM':average>=75?'STRONG PROGRESS':average>=60?'BUILDING MOMENTUM':'ROOM TO GROW'}</small></div></div><div className="exam-metrics"><div><span>UPCOMING / UNMARKED</span><b>{upcoming.length}</b><small>Tests to prepare for</small></div><div><span>MARKED EXAMS</span><b>{marked.length}</b><small>Results recorded</small></div><div><span>AVERAGE SCORE</span><b>{average===null?'—':average+'%'}</b><small>Across marked exams</small></div><div><span>BEST SCORE</span><b>{marked.length?Math.max(...marked.map(r=>Math.round(r.obtained_marks!/r.max_marks!*100)))+'%':'—'}</b><small>Your current peak</small></div></div><div className="exam-subject-insights"><div className="exam-insight-title"><span className="eyebrow">SUBJECT SNAPSHOT</span><b>Results by subject</b></div><div className="exam-subject-grid">{subjects.map((s,i)=>{const list=marked.filter(r=>r.subject.toLowerCase()===s.toLowerCase());const avg=list.length?Math.round(list.reduce((n,r)=>n+(r.obtained_marks!/r.max_marks!)*100,0)/list.length):null;return <div className="exam-subject-card" key={s}><span className={'subject-icon subject-'+i}>{['∑','ϟ','⚗','Aa','Py','◈'][i]}</span><div><b>{s}</b><small>{list.length?list.length+' result'+(list.length===1?'':'s'):'No results yet'}</small></div><strong>{avg===null?'—':avg+'%'}</strong><div className="exam-subject-track"><i style={{width:(avg??0)+'%'}}/></div></div>})}</div></div><form className="exam-form" onSubmit={add}><h3>Add exam</h3><input required maxLength={120} value={name} onChange={e=>setName(e.target.value)} placeholder="Exam name (e.g. Physics Unit Test)"/><div className="exam-form-row"><select value={subject} onChange={e=>setSubject(e.target.value)}>{subjects.map(s=><option key={s}>{s}</option>)}</select><input type="date" required value={date} onChange={e=>setDate(e.target.value)}/></div><div className="exam-form-row"><label>Maximum marks<input type="number" min="1" max="10000" value={max} onChange={e=>setMax(e.target.value)}/></label><label>Obtained marks · optional<input type="number" min="0" max={max||undefined} value={obtained} onChange={e=>setObtained(e.target.value)} placeholder="Add later"/></label></div><button className="primary-btn" disabled={saving}>{saving?'Saving…':'Save exam'}</button></form><div className="exam-list-heading"><h3>Exam timeline</h3><span>{rows.length} records</span></div>{loading?<div className="planner-empty">Loading exam records…</div>:rows.length===0?<div className="planner-empty">No exams yet. Add an upcoming test to start tracking.</div>:<div className="exam-list">{rows.map(row=>{const day=new Date(row.exam_date);const days=Math.ceil((new Date(day.getFullYear(),day.getMonth(),day.getDate()).getTime()-new Date().setHours(0,0,0,0))/86400000);return <article className="exam-row" key={row.id}><div className="exam-datebox"><b>{day.toLocaleDateString('en',{day:'2-digit'})}</b><span>{day.toLocaleDateString('en',{month:'short'}).toUpperCase()}</span></div><div className="exam-main"><b>{row.name}</b><span>{row.subject} · {days>=0?(days===0?'Today':days+' days left'):'Past exam'}</span>{row.obtained_marks!==null&&row.max_marks!==null&&<div className="exam-score-track"><i style={{width:Math.min(100,row.obtained_marks/row.max_marks*100)+'%'}}/></div>}</div><div className="exam-score">{row.obtained_marks!==null?<b>{row.obtained_marks}{row.max_marks!==null?'/'+row.max_marks:''}</b>:<input aria-label={'Marks obtained for '+row.name} type="number" min="0" max={row.max_marks??undefined} placeholder="Marks" onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void saveMarks(row,(e.target as HTMLInputElement).value)}}} onBlur={e=>{if(e.target.value!=='')void saveMarks(row,e.target.value)}}/>}{row.obtained_marks!==null&&row.max_marks!==null&&<small>{Math.round(row.obtained_marks/row.max_marks*100)}%</small>}<button className="exam-delete" onClick={()=>void remove(row)} aria-label={'Delete '+row.name}>×</button></div></article>})}</div>}{pendingDelete&&<div role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setPendingDelete(null);}} style={{position:'fixed',inset:0,zIndex:1000,display:'grid',placeItems:'center',padding:20,background:'rgba(2,4,10,.72)',backdropFilter:'blur(12px)'}}><section role="alertdialog" aria-modal="true" aria-labelledby="delete-exam-title" style={{width:'min(100%,420px)',padding:24,border:'1px solid rgba(255,255,255,.12)',borderRadius:22,background:'linear-gradient(145deg,#171a24,#0b0d13)',boxShadow:'0 24px 80px rgba(0,0,0,.48)',color:'#f7f7fb'}}><div style={{width:44,height:44,display:'grid',placeItems:'center',borderRadius:14,background:'rgba(248,113,113,.12)',color:'#fca5a5',fontSize:22,marginBottom:16}}>!</div><h3 id="delete-exam-title" style={{margin:'0 0 8px',fontSize:20}}>Delete this exam?</h3><p style={{margin:'0 0 22px',color:'#a7adbd',lineHeight:1.6}}>“{pendingDelete.name}” will be removed from your exam timeline. This action can’t be undone.</p><div style={{display:'flex',justifyContent:'flex-end',gap:10,flexWrap:'wrap'}}><button type="button" className="secondary-btn" onClick={()=>setPendingDelete(null)}>Keep exam</button><button type="button" className="primary-btn" style={{background:'linear-gradient(135deg,#dc525b,#a92f3b)',borderColor:'transparent'}} onClick={()=>void confirmDelete()}>Delete exam</button></div></section></div>}</section>;
}
export default App;
