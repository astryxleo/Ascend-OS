import { useEffect, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Activity, RefreshCw, Search, Send, ShieldCheck, Wallet, Users, CarFront } from 'lucide-react';

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

  async function refresh() {
    if (!supabase) return;
    setBusy(true);
    try {
      const [s, u, b] = await Promise.all([
        supabase.rpc('operator_dashboard_stats'),
        supabase.rpc('operator_search_users', { p_query: query }),
        supabase.from('broadcasts').select('*').order('created_at', { ascending: false }).limit(20),
      ]);
      if (s.error) setNotice('Dashboard stats failed: ' + s.error.message);
      else setStats((s.data ?? {}) as Stats);

      if (u.error) {
        setNotice('User list refresh failed: ' + u.error.message);
      } else {
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
      setNotice('Dashboard refresh failed: ' + (error instanceof Error ? error.message : 'Unexpected error.'));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
    // Refresh when the connected Supabase client changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  async function searchUsers(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('operator_search_users', { p_query: query });
      if (error) {
        setNotice('User search failed: ' + error.message);
        return;
      }
      const nextUsers = (data ?? []) as UserRow[];
      setUsers(nextUsers);
      setTarget((current) =>
        nextUsers.some((user) => user.user_id === current)
          ? current
          : (nextUsers[0]?.user_id ?? ''),
      );
    } catch (error) {
      setNotice('User search failed: ' + (error instanceof Error ? error.message : 'Unexpected error.'));
    } finally {
      setBusy(false);
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

  const tabs = ['Overview', 'Users', 'Wallet', 'Broadcasts'];

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
              ['Vehicles', 'vehicles'],
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
            <button onClick={() => setTab('Broadcasts')}><Activity /><b>Global broadcast</b><span>System-wide alerts</span></button>
            <button onClick={() => setNotice('Marketplace catalog editor is not implemented yet.')}><CarFront /><b>Marketplace</b><span>Vehicle catalog</span></button>
          </div>
        </>
      )}

      {tab === 'Users' && (
        <>
          <form className="operator-search" onSubmit={searchUsers}>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search username, name or email…" />
            <button disabled={busy}><Search size={14} /> Search</button>
          </form>
          <div className="operator-user-list">
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
            {users.length === 0 && <p className="operator-help">No users found for this search.</p>}
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
