import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import './operator-contact.css';
import MarkdownMessage from './MarkdownMessage';
import { Activity, RefreshCw, Search, Send, ShieldCheck, Wallet, Users, MessageSquareText, CheckCircle2, Clock3, Bell, Gift, Sparkles, Zap, Download, Percent, RotateCcw, CalendarDays, AlertTriangle } from 'lucide-react';

type UserRow = {
  user_id: string;
  username: string;
  full_name: string;
  email: string;
  role: string;
  class_grade: string;
  coins: number;
  cash: number;
  focus_minutes: number;
  completed_steps: number;
};
type Stats = Record<string, number>;
type CosmeticItem={id:string;label:string;slot:string;value:string;price_coins:number;original_price_coins:number;discount_percent:number;rarity:string;active:boolean};
type Dossier={profile:Record<string,any>;stats:Record<string,number>;daily:Array<{day:string;focus_minutes:number;focus_sessions:number;tasks_completed:number;tasks_planned:number;tasks:Array<{title:string;subject:string|null;priority:string;completed:boolean;completed_at:string|null}>}>};
type ContactRequest={id:string;user_id:string;user_email:string;category:string;subject:string;message:string;status:string;operator_remark:string;created_at:string;updated_at:string};
type WalletTransaction = { id: string; user_id: string; username: string | null; full_name: string | null; currency: string; amount: number; reason: string; source: string; created_by: string | null; created_at: string };
type Broadcast = {
  id: string;
  title: string;
  message: string;
  kind: string;
  is_published: boolean;
  ends_at: string | null;
  created_at: string;
};

export default function OperatorPanel({
  supabase,
  setNotice,
}: {
  supabase: SupabaseClient | null;
  setNotice: (s: string) => void;
}) {
  const [tab, setTab] = useState('Overview');
  const [stats, setStats] = useState<Stats>({});
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoadError, setUsersLoadError] = useState('');
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState('');
  const [amount, setAmount] = useState('100');
  const [reason, setReason] = useState('Study milestone reward');
  const [currency, setCurrency] = useState('coins');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [kind, setKind] = useState('info');
  const [publish, setPublish] = useState(true);
  const [busy, setBusy] = useState(false);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [walletTransactions, setWalletTransactions] = useState<WalletTransaction[]>([]);
  const [walletAuditError, setWalletAuditError] = useState('');
  const [walletAuditQuery, setWalletAuditQuery] = useState('');
  const [contactRequests,setContactRequests]=useState<ContactRequest[]>([]);
  const [contactFilter,setContactFilter]=useState('all');
  const [readRequest,setReadRequest]=useState<Record<string,boolean>>({});
  const [remarks,setRemarks]=useState<Record<string,string>>({});
  const [requestBusy,setRequestBusy]=useState('');
  const [notifyTarget,setNotifyTarget]=useState('');
  const [notifyTitle,setNotifyTitle]=useState('');
  const [notifyMessage,setNotifyMessage]=useState('');
  const [notifyKind,setNotifyKind]=useState('operator');
  const [giftCoins,setGiftCoins]=useState('0');
  const [giftSouls,setGiftSouls]=useState('0');
  const [giftXp,setGiftXp]=useState('0');
  const [giftMessage,setGiftMessage]=useState('A little gift to celebrate your progress — keep ascending!');
  const [dossier,setDossier]=useState<Dossier|null>(null);
  const [dossierLoading,setDossierLoading]=useState(false);
  const [cosmetics,setCosmetics]=useState<CosmeticItem[]>([]);
  const [discountValues,setDiscountValues]=useState<Record<string,string>>({});
  const [warningTarget,setWarningTarget]=useState('');
  const [warningTitle,setWarningTitle]=useState('Account conduct notice');
  const [warningMessage,setWarningMessage]=useState('');
  const usersRequestId = useRef(0);
  const dashboardRequestId = useRef(0);
  const walletAuditRequestId = useRef(0);

  async function refresh() {
    if (!supabase) return;
    const dashboardRequest = ++dashboardRequestId.current;
    const usersRequest = ++usersRequestId.current;
    setBusy(true);
    try {
      const [s, u, b] = await Promise.all([
        supabase.rpc('operator_dashboard_stats'),
        supabase.rpc('operator_search_users', { p_query: query }),
        supabase.from('broadcasts').select('*').order('created_at', { ascending: false }).limit(20),
      ]);
      if (dashboardRequest !== dashboardRequestId.current) return;
      if (s.error) setNotice('Dashboard stats failed: ' + s.error.message);
      else setStats((s.data ?? {}) as Stats);

      if (usersRequest === usersRequestId.current && u.error) {
        setUsers([]);
        setUsersLoadError(u.error.message);
        setNotice('User list refresh failed: ' + u.error.message);
      } else if (usersRequest === usersRequestId.current) {
        setUsersLoadError('');
        const nextUsers = (u.data ?? []) as UserRow[];
        setUsers(nextUsers);
        setTarget((current) =>
          nextUsers.some((user) => user.user_id === current)
            ? current
            : (nextUsers[0]?.user_id ?? ''),
        );
      }

      if (b.error) setNotice('Broadcast refresh failed: ' + b.error.message);
      else setBroadcasts((b.data ?? []) as Broadcast[]);
    } catch (error) {
      if (dashboardRequest === dashboardRequestId.current) setNotice('Dashboard refresh failed: ' + (error instanceof Error ? error.message : 'Unexpected error.'));
    } finally {
      if (dashboardRequest === dashboardRequestId.current) setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
    // Refresh when the connected Supabase client changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => {
    const onRealtime = (event: Event) => {
      const table = (event as CustomEvent<any>).detail?.table;
      if (['profiles','wallets','wallet_transactions','broadcasts','activity_events','combat_matches','study_duels','study_squads','study_squad_members'].includes(table)) void refresh();
    };
    window.addEventListener('ascend:realtime', onRealtime);
    return () => window.removeEventListener('ascend:realtime', onRealtime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  async function searchUsers(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    const usersRequest = ++usersRequestId.current;
    setSearchingUsers(true);
    try {
      const { data, error } = await supabase.rpc('operator_search_users', { p_query: query });
      if (usersRequest !== usersRequestId.current) return;
      if (error) {
        setUsers([]);
        setUsersLoadError(error.message);
        setNotice('User search failed: ' + error.message);
        return;
      }
      setUsersLoadError('');
      const nextUsers = (data ?? []) as UserRow[];
      setUsers(nextUsers);
      setTarget((current) =>
        nextUsers.some((user) => user.user_id === current)
          ? current
          : (nextUsers[0]?.user_id ?? ''),
      );
    } catch (error) {
      if (usersRequest !== usersRequestId.current) return;
      const message = error instanceof Error ? error.message : 'Unexpected error.';
      setUsers([]);
      setUsersLoadError(message);
      setNotice('User search failed: ' + message);
    } finally {
      if (usersRequest === usersRequestId.current) setSearchingUsers(false);
    }
  }

  async function adjust(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !target) return;
    const numericAmount = Number(amount);
    const cleanReason = reason.trim();
    if (!Number.isSafeInteger(numericAmount) || numericAmount === 0) {
      setNotice('Enter a non-zero whole number within the safe numeric range.');
      return;
    }
    if (!['coins', 'cash'].includes(currency)) {
      setNotice('Choose a valid wallet currency.');
      return;
    }
    if (cleanReason.length < 3 || cleanReason.length > 240) {
      setNotice('Reason must be 3–240 characters.');
      return;
    }
    if (!users.some((user) => user.user_id === target)) {
      setNotice('Choose a user from the current results, then try again.');
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.rpc('operator_adjust_wallet', {
        p_target_user: target,
        p_currency: currency,
        p_amount: numericAmount,
        p_reason: cleanReason,
      });
      if (error) {
        setNotice('Wallet adjustment failed: ' + error.message);
      } else {
        setNotice('Wallet adjustment saved to audit history.');
        await refresh();
      }
    } catch (error) {
      setNotice('Wallet adjustment failed: ' + (error instanceof Error ? error.message : 'Unexpected error.'));
    } finally {
      setBusy(false);
    }
  }

  async function sendRewardGift(event: FormEvent) {
    event.preventDefault();
    if(!supabase||!target)return;
    const coins=Number(giftCoins),souls=Number(giftSouls),xp=Number(giftXp),note=giftMessage.trim();
    if([coins,souls,xp].some(v=>!Number.isSafeInteger(v)||v<0)||coins+souls+xp===0){setNotice('Enter non-negative whole-number rewards and make at least one reward greater than zero.');return;}
    if(note.length<1||note.length>1000){setNotice('Gift message must be between 1 and 1,000 characters.');return;}
    if(!users.some(user=>user.user_id===target)){setNotice('Choose a user from the loaded account list.');return;}
    setBusy(true);
    try{const {error}=await supabase.rpc('operator_gift_rewards',{p_target_user:target,p_coins:coins,p_souls:souls,p_xp:xp,p_message:note});if(error){setNotice('Reward gift failed: '+error.message);return;}const recipient=users.find(user=>user.user_id===target);setNotice('Gift sent to '+(recipient?.full_name||'the selected player')+'. Their in-app notification should arrive live.');setGiftCoins('0');setGiftSouls('0');setGiftXp('0');await refresh();}
    catch(error){setNotice('Reward gift failed: '+(error instanceof Error?error.message:'Unexpected error.'));}
    finally{setBusy(false);}
  }

  async function loadDossier(userId:string){if(!supabase||!userId)return;setTarget(userId);setDossierLoading(true);setDossier(null);try{const {data,error}=await supabase.rpc('operator_get_user_dossier',{p_target_user:userId});if(error){setNotice('Could not load user dossier: '+error.message);return;}setDossier(data as Dossier);}catch(error){setNotice('Could not load user dossier: '+(error instanceof Error?error.message:'Unexpected error.'));}finally{setDossierLoading(false);}}
  async function downloadDossierCard(){if(!dossier)return;const p=dossier.profile,s=dossier.stats;const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1500;const ctx=canvas.getContext('2d');if(!ctx){setNotice('Could not create the player card image.');return;}const bg=ctx.createLinearGradient(0,0,1200,1500);bg.addColorStop(0,'#1b1b2a');bg.addColorStop(.55,'#090a11');bg.addColorStop(1,'#111725');ctx.fillStyle=bg;ctx.fillRect(0,0,1200,1500);ctx.strokeStyle='#d8b66b90';ctx.lineWidth=3;ctx.roundRect(35,35,1130,1430,36);ctx.stroke();ctx.fillStyle='#e7ca81';ctx.font='900 26px Arial';ctx.fillText('ASCEND OS / OPERATOR DOSSIER',78,105);ctx.fillStyle='#f7f6fc';ctx.font='900 60px Arial';ctx.fillText('PLAYER PROFILE',78,190);ctx.fillStyle='#b3b7c9';ctx.font='25px Arial';ctx.fillText('PRIVATE ACCOUNT · ADMINISTRATIVE VIEW',80,235);ctx.fillStyle='#111522';ctx.roundRect(75,290,1050,270,24);ctx.fill();ctx.fillStyle='#fff';ctx.font='900 44px Arial';ctx.fillText(String(p.full_name||p.username||'Player').slice(0,28),112,365);ctx.fillStyle='#e7ca81';ctx.font='bold 28px Arial';ctx.fillText('@'+String(p.username||'unknown').slice(0,32),112,415);ctx.fillStyle='#b7bfd0';ctx.font='22px Arial';ctx.fillText(String(p.email||'').slice(0,54),112,465);ctx.fillText('Role: '+String(p.role||'student')+' · Grade: '+String(p.class_grade||'—')+' · Stream: '+String(p.stream||'—'),112,515);const metrics:Array<[string,unknown]>=[['COINS',s.coins],['ASCEND SOULS',s.ascend_souls],['COMBAT LEVEL',s.combat_level],['COMBAT XP',s.combat_xp],['FOCUS MINUTES',s.focus_minutes],['FOCUS SESSIONS',s.focus_sessions],['TASKS COMPLETED',s.completed_tasks],['SYLLABUS CHECKPOINTS',s.syllabus_checkpoints]];metrics.forEach((m,i)=>{const x=78+(i%2)*530,y=600+Math.floor(i/2)*145;ctx.fillStyle='#121722';ctx.roundRect(x,y,500,112,18);ctx.fill();ctx.strokeStyle='#d8b66b35';ctx.stroke();ctx.fillStyle='#b5bacb';ctx.font='bold 20px Arial';ctx.fillText(m[0],x+24,y+38);ctx.fillStyle='#f5d98d';ctx.font='900 39px Arial';ctx.fillText(Number(m[1]||0).toLocaleString('en-IN'),x+24,y+84);});ctx.fillStyle='#929bb0';ctx.font='20px Arial';ctx.fillText('Generated by Operator Control Center · '+new Date().toLocaleString(),80,1370);const a=document.createElement('a');a.download='ascend-player-'+String(p.username||'profile').replace(/[^a-z0-9_-]/gi,'-')+'.png';a.href=canvas.toDataURL('image/png');a.click();}
  async function loadCosmetics(){if(!supabase)return;const {data,error}=await supabase.from('combat_cosmetic_catalog').select('id,label,slot,value,price_coins,original_price_coins,discount_percent,rarity,active').order('slot').order('label');if(error){setNotice('Could not load marketplace items: '+error.message);return;}const items=(data??[]) as CosmeticItem[];setCosmetics(items);setDiscountValues(Object.fromEntries(items.map(item=>[item.id,String(item.discount_percent||0)])));}
  async function saveDiscount(item:CosmeticItem,reset=false){if(!supabase)return;const discount=Number(discountValues[item.id]??item.discount_percent??0);if(!reset&&(!Number.isInteger(discount)||discount<0||discount>95)){setNotice('Discount must be between 0 and 95.');return;}setBusy(true);try{const {error}=await supabase.rpc('operator_set_cosmetic_discount',{p_cosmetic_id:item.id,p_discount_percent:discount,p_reset:reset});if(error){setNotice('Could not update price: '+error.message);return;}setNotice(reset?'Original price restored for '+item.label+'.':'Discount saved for '+item.label+'.');await loadCosmetics();}finally{setBusy(false);}}
  async function sendWarning(event:FormEvent){event.preventDefault();if(!supabase||!warningTarget)return;if(warningTitle.trim().length<3||warningMessage.trim().length<3){setNotice('Add a warning title and a message of at least 3 characters.');return;}setBusy(true);try{const {error}=await supabase.rpc('operator_send_user_warning',{p_target_user:warningTarget,p_title:warningTitle.trim(),p_message:warningMessage.trim()});if(error){setNotice('Warning could not be sent: '+error.message);return;}setNotice('Warning sent. Their live popup should appear while they are online.');setWarningMessage('');}finally{setBusy(false);}}
  async function createBroadcast(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('operator_save_broadcast', {
        p_id: null,
        p_title: title.trim(),
        p_message: message.trim(),
        p_kind: kind,
        p_is_published: publish,
        p_ends_at: null,
      });
      if (error) {
        setNotice('Broadcast save failed: ' + error.message);
      } else {
        setTitle('');
        setMessage('');
        setNotice(publish ? 'Broadcast published.' : 'Draft saved.');
        await refresh();
      }
    } catch (error) {
      setNotice('Broadcast save failed: ' + (error instanceof Error ? error.message : 'Unexpected error.'));
    } finally {
      setBusy(false);
    }
  }

  async function toggleBroadcast(broadcast: Broadcast) {
    if (!supabase) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('operator_save_broadcast', {
        p_id: broadcast.id,
        p_title: broadcast.title,
        p_message: broadcast.message,
        p_kind: broadcast.kind,
        p_is_published: !broadcast.is_published,
        p_ends_at: broadcast.ends_at,
      });
      if (error) setNotice('Broadcast update failed: ' + error.message);
      else await refresh();
    } catch (error) {
      setNotice('Broadcast update failed: ' + (error instanceof Error ? error.message : 'Unexpected error.'));
    } finally {
      setBusy(false);
    }
  }

  async function loadWalletAudit() {
    if (!supabase) return;
    const request = ++walletAuditRequestId.current;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('operator_wallet_audit', { p_limit: 100 });
      if (request !== walletAuditRequestId.current) return;
      if (error) {
        setWalletTransactions([]);
        setWalletAuditError(error.message);
        setNotice('Wallet audit history failed to load: ' + error.message);
      } else {
        setWalletAuditError('');
        setWalletTransactions((data ?? []) as WalletTransaction[]);
      }
    } catch (error) {
      if (request !== walletAuditRequestId.current) return;
      const message = error instanceof Error ? error.message : 'Unexpected error.';
      setWalletTransactions([]);
      setWalletAuditError(message);
      setNotice('Wallet audit history failed to load: ' + message);
    }
    finally { if (request === walletAuditRequestId.current) setBusy(false); }
  }
  useEffect(() => { if (tab === 'Wallet audit') void loadWalletAudit(); else walletAuditRequestId.current += 1; }, [tab, supabase]);
  async function sendDirectNotification(event:FormEvent){event.preventDefault();if(!supabase||busy||!notifyTarget)return;setBusy(true);const {error}=await supabase.rpc('operator_send_notification',{p_user_id:notifyTarget,p_title:notifyTitle.trim(),p_message:notifyMessage.trim(),p_kind:notifyKind});if(error)setNotice('Notification could not be sent: '+error.message);else{setNotice('Notification delivered to the selected user in real time.');setNotifyTitle('');setNotifyMessage('');}setBusy(false);}
  const loadContactRequests=async()=>{if(!supabase)return;const {data,error}=await supabase.from('operator_contact_requests').select('*').order('created_at',{ascending:false}).limit(100);if(error){setNotice('Contact requests failed to load: '+error.message);return;}setContactRequests((data||[]) as ContactRequest[]);};
  useEffect(()=>{if(tab!=='Contact requests'||!supabase)return;void loadContactRequests();const ch=supabase.channel('operator-contact-inbox').on('postgres_changes',{event:'*',schema:'public',table:'operator_contact_requests'},()=>void loadContactRequests()).subscribe();return()=>{void supabase.removeChannel(ch)};},[tab,supabase]);
  async function updateContactRequest(row:ContactRequest,status:string){if(!supabase||requestBusy)return;if(!readRequest[row.id]){setNotice('Read the complete request card and confirm before changing its status.');return;}setRequestBusy(row.id);const remark=remarks[row.id]??row.operator_remark??'';const {error}=await supabase.rpc('operator_manage_contact_request',{p_request_id:row.id,p_status:status,p_remark:remark,p_read_confirmed:true});if(error)setNotice('Could not update request: '+error.message);else{setNotice('Request status updated. The user has been notified.');await loadContactRequests();}setRequestBusy('');}
  const filteredContactRequests=contactRequests.filter(r=>contactFilter==='all'||r.status===contactFilter);
  const visibleWalletTransactions = walletTransactions.filter(row => {
    return [row.reason, row.source, row.currency, row.user_id, row.username ?? '', row.full_name ?? ''].join(' ').toLowerCase().includes(walletAuditQuery.toLowerCase());
  });

  useEffect(()=>{if(tab==='Marketplace discounts')void loadCosmetics();},[tab,supabase]);

  const tabs = ['Overview', 'Users', 'Daily activity', 'Wallet', 'Gift terminal', 'Marketplace discounts', 'Warnings', 'Wallet audit', 'Broadcasts', 'Contact requests', 'Notifications'];

  return (
    <section className="panel operator-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">ROOT ACCESS · OPERATOR EDITION</span>
          <h2>Control center</h2>
        </div>
        <button className="operator-refresh" onClick={() => void refresh()} disabled={busy}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="operator-warning">
        <ShieldCheck size={18} />
        <div>
          <b>Server-authorized controls</b>
          <span>Database RPCs verify operator permissions independently of this interface.</span>
        </div>
      </div>

      <div className="operator-tabs">
        {tabs.map((item) => (
          <button key={item} className={tab === item ? 'selected' : ''} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <>
          <div className="operator-stats">
            {[
              ['Students', 'users'],
              ['Focus sessions', 'focus_sessions'],
              ['Focus minutes', 'focus_minutes'],
              ['Exams', 'exams'],
              ['Live broadcasts', 'published_broadcasts'],
            ].map(([label, key]) => (
              <div className="operator-stat" key={key}>
                <span>{label}</span>
                <b>{(stats[key] ?? 0).toLocaleString()}</b>
              </div>
            ))}
          </div>
          <div className="operator-grid">
            <button onClick={() => setTab('Users')}><Users /><b>User inspector</b><span>Progress & readiness</span></button>
            <button onClick={() => setTab('Wallet')}><Wallet /><b>Reward terminal</b><span>Audited wallet changes</span></button>
            <button onClick={() => setTab('Wallet audit')}><Activity /><b>Wallet audit log</b><span>Latest currency ledger entries</span></button>
            <button onClick={() => setTab('Gift terminal')}><Gift /><b>Reward & gift terminal</b><span>Coins, souls, XP + live message</span></button><button onClick={() => setTab('Marketplace discounts')}><Percent/><b>Marketplace pricing</b><span>Discount or restore item prices</span></button><button onClick={() => setTab('Warnings')}><AlertTriangle/><b>Warning terminal</b><span>Private conduct notices</span></button><button onClick={() => setTab('Daily activity')}><CalendarDays/><b>Daily activity</b><span>Focus & tasks per player</span></button>
            <button onClick={() => setTab('Broadcasts')}><Activity /><b>Global broadcast</b><span>System-wide alerts</span></button>
          </div>
        </>
      )}

      {tab === 'Users' && (
        <>
          <div className="operator-user-count"><Users size={16}/><b>{Number(stats.total_users??users.length).toLocaleString('en-IN')} users</b><span>Click any username to open their full dossier.</span></div>
          <form className="operator-search" onSubmit={searchUsers}>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search username, name or email…" />
            <button disabled={searchingUsers}><Search size={14} /> {searchingUsers ? 'Searching…' : 'Search'}</button>
          </form>
          <div className="operator-user-list">
            {usersLoadError && <p className="operator-help" role="alert">Could not load users: {usersLoadError}. Try searching again or use Refresh.</p>}
            {users.map((user) => (
              <button
                type="button"
                className={'operator-user ' + (target === user.user_id ? 'active' : '')}
                key={user.user_id}
                onClick={() => void loadDossier(user.user_id)}
              >
                <span>
                  <b>{user.full_name}</b>
                  <small>@{user.username} · {user.email}</small>
                  <small>{user.focus_minutes} focus min · {user.completed_steps} steps</small>
                </span>
                <span className="operator-user-balance">
                  {currency === 'cash' ? '$' : '◈'} {currency === 'cash' ? user.cash : user.coins}
                  <small>{user.role}</small>
                </span>
              </button>
            ))}
            {users.length === 0 && !usersLoadError && <p className="operator-help">No users found for this search.</p>}
          </div>
          {dossierLoading&&<div className="operator-warning"><RefreshCw size={16}/> Loading full player dossier…</div>}
          {dossier&&<section className="operator-dossier">
            <header><div><span>FULL PLAYER DOSSIER</span><h3>{dossier.profile.full_name||dossier.profile.username}</h3><p>@{dossier.profile.username} · {dossier.profile.email}</p></div><button type="button" className="operator-primary" onClick={()=>void downloadDossierCard()}><Download size={14}/> Download card PNG</button></header>
            <div className="operator-dossier-grid">{[['Coins',dossier.stats.coins],['Ascend Souls',dossier.stats.ascend_souls],['Combat level',dossier.stats.combat_level],['Combat XP',dossier.stats.combat_xp],['Focus minutes',dossier.stats.focus_minutes],['Focus sessions',dossier.stats.focus_sessions],['Tasks completed',dossier.stats.completed_tasks],['Tasks pending',dossier.stats.pending_tasks],['Syllabus checkpoints',dossier.stats.syllabus_checkpoints],['Combat rating',dossier.stats.combat_rating],['Combat wins',dossier.stats.combat_wins],['Combat losses',dossier.stats.combat_losses]].map(([label,value])=><article key={String(label)}><span>{label}</span><b>{Number(value||0).toLocaleString('en-IN')}</b></article>)}</div>
            <div className="operator-dossier-meta"><span>Role: {dossier.profile.role||'—'}</span><span>Class: {dossier.profile.class_grade||'—'}</span><span>Stream: {dossier.profile.stream||'—'}</span><span>Target: {dossier.profile.school_target||'—'}</span><span>Joined: {dossier.profile.created_at?new Date(dossier.profile.created_at).toLocaleDateString():'—'}</span></div>
          </section>}
        </>
      )}

      {tab === 'Wallet' && (
        <form className="operator-form" onSubmit={adjust}>
          <p className="operator-help">Positive values grant currency; negative values deduct it. Every change is audited.</p>
          <label>Account
            <select value={target} onChange={(event) => setTarget(event.target.value)} required>
              <option value="">Choose account</option>
              {users.map((user) => <option key={user.user_id} value={user.user_id}>{user.full_name} · @{user.username}</option>)}
            </select>
          </label>
          <label>Currency
            <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
              <option value="coins">Coins</option>
              <option value="cash">Cash</option>
            </select>
          </label>
          <label>Amount <input type="number" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label>
          <label>Reason <input value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={240} required /></label>
          <button className="operator-primary" disabled={busy || !target}><Wallet size={14} /> Apply adjustment</button>
        </form>
      )}

      {tab === 'Gift terminal' && (
        <section className="operator-gift-terminal">
          <div className="operator-warning"><Gift size={18}/><div><b>Operator reward terminal</b><span>Gift Coins, Ascend Souls and XP with a personal message delivered through the live in-app notification system.</span></div></div>
          <form className="operator-form" onSubmit={sendRewardGift}>
            <label className="operator-wide">Recipient account<select value={target} onChange={e=>setTarget(e.target.value)} required><option value="">Choose a player…</option>{users.map(user=><option key={user.user_id} value={user.user_id}>{user.full_name} · @{user.username} · {user.email}</option>)}</select></label>
            <label><span style={{display:'flex',alignItems:'center',gap:7}}><Wallet size={14}/> Coins</span><input type="number" min="0" step="1" value={giftCoins} onChange={e=>setGiftCoins(e.target.value)} required/></label>
            <label><span style={{display:'flex',alignItems:'center',gap:7}}><Sparkles size={14}/> Ascend Souls</span><input type="number" min="0" step="1" value={giftSouls} onChange={e=>setGiftSouls(e.target.value)} required/></label>
            <label><span style={{display:'flex',alignItems:'center',gap:7}}><Zap size={14}/> XP</span><input type="number" min="0" step="1" value={giftXp} onChange={e=>setGiftXp(e.target.value)} required/></label>
            <label className="operator-wide">Personal message<textarea value={giftMessage} onChange={e=>setGiftMessage(e.target.value)} maxLength={1000} rows={5} required placeholder="Write a personal note for the player…"/></label>
            <div className="operator-gift-preview operator-wide"><span>LIVE POPUP PREVIEW</span><b>✦ A Gift from the Operator</b><p>{giftMessage||'Your message will appear here.'}</p><small>Rewards: {Number(giftCoins||0).toLocaleString()} Coins · {Number(giftSouls||0).toLocaleString()} Ascend Souls · {Number(giftXp||0).toLocaleString()} XP</small></div>
            <button className="operator-primary operator-wide" disabled={busy||!target||![giftCoins,giftSouls,giftXp].every(v=>Number.isSafeInteger(Number(v))&&Number(v)>=0)||(Number(giftCoins)+Number(giftSouls)+Number(giftXp)===0)||!giftMessage.trim()}><Gift size={15}/>{busy?'Delivering gift…':'Grant rewards & send live message'}</button>
          </form>
          <p className="operator-help">Every gift is saved to the operator gift audit table. Coins also create a wallet transaction record. Rewards are granted server-side and the user notification is saved to their inbox.</p>
        </section>
      )}


      {tab === 'Daily activity' && (
        <section className="operator-daily-activity">
          <div className="operator-warning"><CalendarDays size={18}/><div><b>Daily study telemetry</b><span>Select a player to inspect daily focus time and task completion for the last 30 days.</span></div></div>
          <div className="operator-form"><label>Player<select value={target} onChange={e=>{setTarget(e.target.value);void loadDossier(e.target.value);}}><option value="">Choose a player…</option>{users.map(u=><option key={u.user_id} value={u.user_id}>{u.full_name} · @{u.username}</option>)}</select></label></div>
          {dossier&&<><div className="operator-daily-summary"><b>{dossier.profile.full_name||dossier.profile.username} · Last 30 days</b><span>{Number(dossier.stats.focus_minutes||0).toLocaleString()} total focus minutes</span></div><div className="operator-daily-list">{dossier.daily.slice().reverse().map(day=><article key={day.day}><div><b>{new Date(day.day+'T12:00:00').toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'})}</b><small>{day.focus_sessions} focus sessions · {day.tasks_completed}/{day.tasks_planned} tasks</small></div><div className="operator-daily-meter"><span style={{width:Math.min(100,day.focus_minutes/240*100)+'%'}}/></div><strong>{day.focus_minutes} min</strong>{day.tasks.length>0&&<div className="operator-day-task-list">{day.tasks.map((task,index)=><div key={day.day+'-'+index} className={task.completed?'completed':''}><span>{task.completed?'✓':'○'}</span><b>{task.title}</b><small>{task.subject||'General'} · {task.priority} · {task.completed?'Completed':'Pending'}</small></div>)}</div>}</article>)}</div></>}
        </section>
      )}
      {tab === 'Marketplace discounts' && (
        <section className="operator-marketplace">
          <div className="operator-warning"><Percent size={18}/><div><b>Individual item pricing</b><span>Set a discount per item. Buyers should see the discount percentage and final coin price. Reset restores the original price.</span></div><button type="button" onClick={()=>void loadCosmetics()}><RefreshCw size={14}/> Refresh</button></div>
          <div className="operator-market-items">{cosmetics.map(item=><article key={item.id}><div className="operator-market-item-title"><span>{item.slot} · {item.rarity}</span><b>{item.label}</b><small>{item.active?'Available in shop':'Inactive item'} · {item.id}</small></div><div className="operator-market-prices">{item.discount_percent>0&&<del>{item.original_price_coins.toLocaleString()} coins</del>}<b>{item.price_coins.toLocaleString()} <small>coins</small></b>{item.discount_percent>0&&<span>{item.discount_percent}% OFF</span>}</div><label>Discount %<input type="number" min="0" max="95" step="1" value={discountValues[item.id]??String(item.discount_percent)} onChange={e=>setDiscountValues(v=>({...v,[item.id]:e.target.value}))}/></label><div className="operator-market-actions"><button type="button" disabled={busy} onClick={()=>void saveDiscount(item)}><Percent size={13}/> Apply discount</button><button type="button" disabled={busy||item.discount_percent===0} onClick={()=>void saveDiscount(item,true)}><RotateCcw size={13}/> Reset original price</button></div></article>)}{!cosmetics.length&&<p className="operator-help">No marketplace cosmetics were returned.</p>}</div>
        </section>
      )}
      {tab === 'Warnings' && (
        <section className="operator-warning-terminal">
          <div className="operator-warning"><AlertTriangle size={18}/><div><b>Private warning terminal</b><span>Send a custom warning to any account. It is saved in the user’s notification history and triggers a live popup while online.</span></div></div>
          <form className="operator-direct-notification" onSubmit={sendWarning}>
            <label>RECIPIENT<select value={warningTarget} onChange={e=>setWarningTarget(e.target.value)} required><option value="">Choose a user account…</option>{users.map(user=><option key={user.user_id} value={user.user_id}>{user.full_name} · @{user.username} · {user.email}</option>)}</select></label>
            <label>WARNING TITLE<input value={warningTitle} onChange={e=>setWarningTitle(e.target.value)} minLength={3} maxLength={120} required/></label>
            <label>PERSONALIZED WARNING MESSAGE<textarea value={warningMessage} onChange={e=>setWarningMessage(e.target.value)} minLength={3} maxLength={4000} rows={7} required placeholder="Explain what needs attention and what action is expected…"/></label>
            <div className="operator-direct-preview"><b>LIVE WARNING PREVIEW</b><h3>⚠️ Operator Warning: {warningTitle||'Warning title'}</h3><p>{warningMessage||'Your warning message will appear here.'}</p></div>
            <button className="operator-primary" disabled={busy||!warningTarget||warningTitle.trim().length<3||warningMessage.trim().length<3}><AlertTriangle size={14}/>{busy?'Sending warning…':'Send warning popup'}</button>
          </form>
        </section>
      )}

      {tab === 'Wallet audit' && (
        <>
          <div className="operator-warning"><ShieldCheck size={18} /><div><b>Wallet audit ledger</b><span>Read-only view of the latest 100 currency transactions.</span></div></div>
          <div className="operator-search"><input value={walletAuditQuery} onChange={event => setWalletAuditQuery(event.target.value)} placeholder="Filter by user, reason, source or currency…" aria-label="Filter wallet audit history" /><button type="button" onClick={() => void loadWalletAudit()} disabled={busy}><RefreshCw size={14}/> Refresh</button></div>
          <div className="operator-broadcast-list"><h3>Recent transactions · {visibleWalletTransactions.length}</h3>
            {walletAuditError && <p className="operator-help" role="alert">Could not load wallet history: {walletAuditError}. Use Refresh to try again.</p>}
            {visibleWalletTransactions.map(row => <article key={row.id}><div><b>{row.full_name ? row.full_name + (row.username ? ' · @' + row.username : '') : 'Account ' + row.user_id.slice(0, 8)}</b><p>{row.reason}</p><small>{row.currency.toUpperCase()} · {row.source} · {new Date(row.created_at).toLocaleString()} · {row.created_by ? 'Recorded by ' + row.created_by.slice(0, 8) : 'System recorded'}</small></div><strong style={{whiteSpace:'nowrap'}}>{row.amount > 0 ? '+' : ''}{Number(row.amount).toLocaleString()} {row.currency}</strong></article>)}
            {!busy && !walletAuditError && visibleWalletTransactions.length === 0 && <p className="operator-help">No transactions match this filter.</p>}
          </div>
        </>
      )}

      {tab === 'Contact requests' && (
        <section className="operator-contact-inbox">
          <div className="operator-warning"><MessageSquareText size={18}/><div><b>Direct Operator inbox · {contactRequests.filter(r=>r.status==='awaiting').length} awaiting</b><span>Read the entire request, then confirm you have read it before changing its status. Status changes notify the requester in real time.</span></div><button type="button" onClick={()=>void loadContactRequests()}><RefreshCw size={14}/> Refresh</button></div>
          <div className="operator-contact-filters">{[{v:'all',l:'All requests'},{v:'awaiting',l:'Awaiting'},{v:'accepted',l:'Accepted'},{v:'in_progress',l:'In progress'},{v:'rejected',l:'Rejected'},{v:'resolved',l:'Resolved'}].map(x=><button type="button" key={x.v} className={contactFilter===x.v?'selected':''} onClick={()=>setContactFilter(x.v)}>{x.l}</button>)}</div>
          <div className="operator-contact-list">{filteredContactRequests.map(row=><article className="operator-contact-card" key={row.id}>
            <div className="operator-contact-card-head"><span className={'operator-contact-status status-'+row.status}>{row.status.replaceAll('_',' ')}</span><time>{new Date(row.created_at).toLocaleString()}</time></div>
            <h3>{row.subject}</h3><div className="operator-contact-meta"><span>{row.category}</span><span>{row.user_email||row.user_id}</span><span>Ref · {row.id.slice(0,8).toUpperCase()}</span></div>
            <div className="operator-contact-message"><b>Full message</b><MarkdownMessage value={row.message}/></div>
            <label className="operator-contact-remark">Operator remark / reply<textarea rows={3} maxLength={4000} value={remarks[row.id]??row.operator_remark??''} onChange={e=>setRemarks(v=>({...v,[row.id]:e.target.value}))} placeholder="Write a clear Markdown reply. It will appear in the user's request tracker and notification…"/></label>
            <label className="operator-contact-read"><input type="checkbox" checked={!!readRequest[row.id]} onChange={e=>setReadRequest(v=>({...v,[row.id]:e.target.checked}))}/> I have read the complete request and understand what the user is asking.</label>
            <div className="operator-contact-actions"><button disabled={!readRequest[row.id]||!!requestBusy} onClick={()=>void updateContactRequest(row,'accepted')}><CheckCircle2 size={14}/> Accept</button><button disabled={!readRequest[row.id]||!!requestBusy} onClick={()=>void updateContactRequest(row,'in_progress')}><Clock3 size={14}/> In progress</button><button disabled={!readRequest[row.id]||!!requestBusy} onClick={()=>void updateContactRequest(row,'rejected')}>Reject</button><button disabled={!readRequest[row.id]||!!requestBusy} onClick={()=>void updateContactRequest(row,'resolved')}>Resolve</button>{requestBusy===row.id&&<span>Saving…</span>}</div>
            <small className="operator-contact-updated">Last updated {new Date(row.updated_at).toLocaleString()} · Current status: {row.status.replaceAll('_',' ')}</small>
          </article>)}{!filteredContactRequests.length&&<p className="operator-help">No requests in this view. New user messages will appear here live.</p>}</div>
        </section>
      )}

      {tab === 'Notifications' && (
        <section className="operator-contact-inbox">
          <div className="operator-warning"><Bell size={18}/><div><b>Direct notification terminal</b><span>Send a private in-app message to one account. The user receives a live popup and the message remains in their Notifications history.</span></div></div>
          <form className="operator-direct-notification" onSubmit={sendDirectNotification}>
            <label>RECIPIENT<select value={notifyTarget} onChange={e=>setNotifyTarget(e.target.value)} required><option value="">Choose a user account…</option>{users.map(user=><option key={user.user_id} value={user.user_id}>{user.full_name} · @{user.username} · {user.email}</option>)}</select></label>
            <label>MESSAGE TYPE<select value={notifyKind} onChange={e=>setNotifyKind(e.target.value)}><option value="operator">Operator message</option><option value="info">Information</option><option value="success">Success / positive update</option><option value="warning">Important / action needed</option></select></label>
            <label>HEADLINE<input value={notifyTitle} onChange={e=>setNotifyTitle(e.target.value)} minLength={3} maxLength={120} required placeholder="A concise notification title"/></label>
            <label>MESSAGE <span>Markdown supported</span><textarea value={notifyMessage} onChange={e=>setNotifyMessage(e.target.value)} minLength={3} maxLength={4000} rows={7} required placeholder={'Write your message…\n\n**Important details**\n- Next step or context'}/></label>
            <div className="operator-direct-preview"><b>LIVE MESSAGE PREVIEW</b><h3>{notifyTitle||'Your notification headline'}</h3><MarkdownMessage value={notifyMessage||'Your formatted message will appear here.'}/></div>
            <button className="operator-primary" disabled={busy||!notifyTarget||notifyTitle.trim().length<3||notifyMessage.trim().length<3}><Send size={14}/>{busy?'Sending securely…':'Send notification'}</button>
          </form>
        </section>
      )}

      {tab === 'Broadcasts' && (
        <>
          <form className="operator-form" onSubmit={createBroadcast}>
            <label>Headline <input value={title} onChange={(event) => setTitle(event.target.value)} minLength={3} maxLength={120} required /></label>
            <label>Category
              <select value={kind} onChange={(event) => setKind(event.target.value)}>
                <option value="info">Information</option>
                <option value="exam">Exam</option>
                <option value="urgent">Urgent</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </label>
            <label className="operator-wide">Message <textarea value={message} onChange={(event) => setMessage(event.target.value)} minLength={3} maxLength={3000} rows={4} required /></label>
            <label className="operator-check"><input type="checkbox" checked={publish} onChange={(event) => setPublish(event.target.checked)} /> Publish immediately</label>
            <button className="operator-primary" disabled={busy}><Send size={14} /> {publish ? 'Publish broadcast' : 'Save draft'}</button>
          </form>
          <div className="operator-broadcast-list">
            <h3>Recent broadcasts</h3>
            {broadcasts.map((broadcast) => (
              <article key={broadcast.id}>
                <div>
                  <b>{broadcast.title}</b>
                  <p>{broadcast.message}</p>
                  <small>{broadcast.kind} · {new Date(broadcast.created_at).toLocaleString()}</small>
                </div>
                <button disabled={busy} onClick={() => void toggleBroadcast(broadcast)}>
                  {broadcast.is_published ? 'Unpublish' : 'Publish'}
                </button>
              </article>
            ))}
            {broadcasts.length === 0 && <p className="operator-help">No broadcasts created yet.</p>}
          </div>
        </>
      )}
    </section>
  );
}
