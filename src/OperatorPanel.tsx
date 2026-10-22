import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import './operator-contact.css';
import MarkdownMessage from './MarkdownMessage';
import { Activity, RefreshCw, Search, Send, ShieldCheck, Wallet, Users, MessageSquareText, CheckCircle2, Clock3 } from 'lucide-react';

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

  const tabs = ['Overview', 'Users', 'Wallet', 'Wallet audit', 'Broadcasts', 'Contact requests', 'Notifications'];

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
            <button onClick={() => setTab('Broadcasts')}><Activity /><b>Global broadcast</b><span>System-wide alerts</span></button>
          </div>
        </>
      )}

      {tab === 'Users' && (
        <>
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
                onClick={() => setTarget(user.user_id)}
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
