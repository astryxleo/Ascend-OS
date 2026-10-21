import { useEffect, useRef, useState, type FormEvent } from 'react';
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
type WalletTransaction = { id: string; user_id: string; username: string | null; full_name: string | null; currency: string; amount: number; reason: string; source: string; created_by: string | null; created_at: string };
type Vehicle = { id: string; name: string; maker: string; tier: string; rarity: string; price_coins: number; price_cash: number; stock_limit: number | null; stock_sold: number; is_available: boolean; is_limited: boolean; is_operator_drop: boolean; top_speed_kmh: number | null; zero_to_100: number | null; horsepower: number | null };
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
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleLoadError, setVehicleLoadError] = useState('');
  const [walletTransactions, setWalletTransactions] = useState<WalletTransaction[]>([]);
  const [walletAuditError, setWalletAuditError] = useState('');
  const [walletAuditQuery, setWalletAuditQuery] = useState('');
  const [vehicleQuery, setVehicleQuery] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [vehicleName, setVehicleName] = useState('');
  const [vehicleMaker, setVehicleMaker] = useState('');
  const [vehicleTier, setVehicleTier] = useState('Hypercar');
  const [vehicleRarity, setVehicleRarity] = useState('Rare');
  const [vehicleCoins, setVehicleCoins] = useState('1000');
  const [vehicleCash, setVehicleCash] = useState('0');
  const [vehicleStock, setVehicleStock] = useState('');
  const [vehicleLimited, setVehicleLimited] = useState(false);
  const [vehicleDrop, setVehicleDrop] = useState(false);
  const [vehicleAvailable, setVehicleAvailable] = useState(true);
  const usersRequestId = useRef(0);
  const dashboardRequestId = useRef(0);
  const vehiclesRequestId = useRef(0);
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

  async function loadVehicles() {
    if (!supabase) return;
    const request = ++vehiclesRequestId.current;
    setBusy(true);
    try {
      const { data, error } = await supabase.from('vehicles').select('id,name,maker,tier,rarity,price_coins,price_cash,stock_limit,stock_sold,is_available,is_limited,is_operator_drop,top_speed_kmh,zero_to_100,horsepower').order('created_at', { ascending: false });
      if (request !== vehiclesRequestId.current) return;
      if (error) {
        setVehicles([]);
        setVehicleLoadError(error.message);
        setNotice('Marketplace catalog failed to load: ' + error.message);
      } else {
        setVehicleLoadError('');
        setVehicles((data ?? []) as Vehicle[]);
      }
    } catch (error) {
      if (request !== vehiclesRequestId.current) return;
      const message = error instanceof Error ? error.message : 'Unexpected error.';
      setVehicles([]);
      setVehicleLoadError(message);
      setNotice('Marketplace catalog failed to load: ' + message);
    } finally { if (request === vehiclesRequestId.current) setBusy(false); }
  }

  useEffect(() => { if (tab === 'Marketplace') void loadVehicles(); else vehiclesRequestId.current += 1; }, [tab, supabase]);

  function selectVehicle(vehicle: Vehicle) {
    setVehicleId(vehicle.id); setVehicleName(vehicle.name); setVehicleMaker(vehicle.maker);
    setVehicleTier(vehicle.tier); setVehicleRarity(vehicle.rarity);
    setVehicleCoins(String(vehicle.price_coins)); setVehicleCash(String(vehicle.price_cash));
    setVehicleStock(vehicle.stock_limit === null ? '' : String(vehicle.stock_limit));
    setVehicleLimited(vehicle.is_limited); setVehicleDrop(vehicle.is_operator_drop); setVehicleAvailable(vehicle.is_available);
  }

  function resetVehicleForm() {
    setVehicleId(''); setVehicleName(''); setVehicleMaker(''); setVehicleTier('Hypercar'); setVehicleRarity('Rare');
    setVehicleCoins('1000'); setVehicleCash('0'); setVehicleStock(''); setVehicleLimited(false); setVehicleDrop(false); setVehicleAvailable(true);
  }

  async function saveVehicle(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    const cleanId = vehicleId.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const coins = Number(vehicleCoins); const cash = Number(vehicleCash);
    const stock = vehicleStock.trim() === '' ? null : Number(vehicleStock);
    if (!cleanId || cleanId.length > 48 || !vehicleName.trim() || !vehicleMaker.trim()) { setNotice('Enter a valid vehicle ID, name and maker.'); return; }
    if (!Number.isSafeInteger(coins) || coins < 0 || !Number.isSafeInteger(cash) || cash < 0) { setNotice('Prices must be non-negative whole numbers.'); return; }
    if (stock !== null && (!Number.isSafeInteger(stock) || stock < 0)) { setNotice('Stock limit must be a non-negative whole number or left blank for unlimited stock.'); return; }
    const existing = vehicles.find(v => v.id === cleanId);
    if (!existing && vehicleId.trim() !== cleanId) { setNotice('Vehicle ID may contain lowercase letters, numbers and hyphens only.'); return; }
    if (existing && stock !== null && stock < existing.stock_sold) { setNotice('Stock limit cannot be lower than units already sold (' + existing.stock_sold + ').'); return; }
    const payload = { id: cleanId, name: vehicleName.trim(), maker: vehicleMaker.trim(), tier: vehicleTier, rarity: vehicleRarity, price_coins: coins, price_cash: cash, stock_limit: stock, is_limited: vehicleLimited, is_operator_drop: vehicleDrop, is_available: vehicleAvailable };
    setBusy(true);
    try {
      const result = existing
        ? await supabase.from('vehicles').update({ name: payload.name, maker: payload.maker, tier: payload.tier, rarity: payload.rarity, price_coins: payload.price_coins, price_cash: payload.price_cash, stock_limit: payload.stock_limit, is_limited: payload.is_limited, is_operator_drop: payload.is_operator_drop, is_available: payload.is_available }).eq('id', cleanId)
        : await supabase.from('vehicles').insert(payload);
      if (result.error) setNotice('Vehicle save failed: ' + result.error.message);
      else { setNotice(existing ? 'Vehicle catalog entry updated.' : 'Vehicle added to the dealership catalog.'); resetVehicleForm(); await loadVehicles(); }
    } catch (error) { setNotice('Vehicle save failed: ' + (error instanceof Error ? error.message : 'Unexpected error.')); }
    finally { setBusy(false); }
  }

  const visibleVehicles = vehicles.filter(v => (v.name + ' ' + v.maker + ' ' + v.id).toLowerCase().includes(vehicleQuery.toLowerCase()));
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
  const visibleWalletTransactions = walletTransactions.filter(row => {
    return [row.reason, row.source, row.currency, row.user_id, row.username ?? '', row.full_name ?? ''].join(' ').toLowerCase().includes(walletAuditQuery.toLowerCase());
  });

  const tabs = ['Overview', 'Users', 'Wallet', 'Wallet audit', 'Broadcasts', 'Marketplace'];

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
            <button onClick={() => setTab('Wallet audit')}><Activity /><b>Wallet audit log</b><span>Latest currency ledger entries</span></button>
            <button onClick={() => setTab('Broadcasts')}><Activity /><b>Global broadcast</b><span>System-wide alerts</span></button>
            <button onClick={() => setTab('Marketplace')}><CarFront /><b>Marketplace</b><span>Manage dealership inventory</span></button>
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

      {tab === 'Marketplace' && (
        <>
          <div className="operator-warning">
            <CarFront size={18} />
            <div><b>Dealership catalog</b><span>Add vehicles, update pricing and control availability. Existing purchases and sold-stock counts are preserved.</span></div>
          </div>
          <form className="operator-form" onSubmit={saveVehicle}>
            <label>Vehicle ID <input value={vehicleId} onChange={event => setVehicleId(event.target.value)} placeholder="e.g. apex-v12" pattern="[a-z0-9-]+" maxLength={48} required disabled={vehicles.some(v => v.id === vehicleId)} /></label>
            <label>Vehicle name <input value={vehicleName} onChange={event => setVehicleName(event.target.value)} maxLength={100} required /></label>
            <label>Maker <input value={vehicleMaker} onChange={event => setVehicleMaker(event.target.value)} maxLength={80} required /></label>
            <label>Tier <select value={vehicleTier} onChange={event => setVehicleTier(event.target.value)}>{['Hypercar','Track Toy','Luxury GT','Concept Prototype','Le Mans Legend'].map(value => <option key={value}>{value}</option>)}</select></label>
            <label>Rarity <select value={vehicleRarity} onChange={event => setVehicleRarity(event.target.value)}>{['Common','Rare','Exotic','Mythic','1-of-1'].map(value => <option key={value}>{value}</option>)}</select></label>
            <label>Price (coins) <input type="number" min="0" step="1" value={vehicleCoins} onChange={event => setVehicleCoins(event.target.value)} required /></label>
            <label>Price (cash) <input type="number" min="0" step="1" value={vehicleCash} onChange={event => setVehicleCash(event.target.value)} required /></label>
            <label>Stock limit <input type="number" min="0" step="1" value={vehicleStock} onChange={event => setVehicleStock(event.target.value)} placeholder="Blank = unlimited" /></label>
            <label className="operator-check"><input type="checkbox" checked={vehicleAvailable} onChange={event => setVehicleAvailable(event.target.checked)} /> Available in dealership</label>
            <label className="operator-check"><input type="checkbox" checked={vehicleLimited} onChange={event => setVehicleLimited(event.target.checked)} /> Limited release</label>
            <label className="operator-check"><input type="checkbox" checked={vehicleDrop} onChange={event => setVehicleDrop(event.target.checked)} /> Operator drop</label>
            <div className="operator-wide" style={{display:'flex',gap:'.65rem',flexWrap:'wrap'}}>
              <button className="operator-primary" disabled={busy}>{busy ? 'Saving…' : vehicles.some(v => v.id === vehicleId) ? 'Save catalog changes' : 'Add vehicle'}</button>
              <button type="button" disabled={busy} onClick={resetVehicleForm}>Clear form</button>
              <button type="button" disabled={busy} onClick={() => void loadVehicles()}><RefreshCw size={14}/> Refresh catalog</button>
            </div>
          </form>
          <div className="operator-search"><input value={vehicleQuery} onChange={event => setVehicleQuery(event.target.value)} placeholder="Filter by name, maker or ID…" aria-label="Filter marketplace catalog" /></div>
          <div className="operator-broadcast-list">
            <h3>Catalog inventory · {visibleVehicles.length} vehicles</h3>
            {vehicleLoadError && <p className="operator-help" role="alert">Could not load the catalog: {vehicleLoadError}. Use Refresh catalog to try again.</p>}
            {visibleVehicles.map(vehicle => <article key={vehicle.id}>
              <div><b>{vehicle.name} <small>· {vehicle.maker}</small></b><p>{vehicle.id} · {vehicle.tier} · {vehicle.rarity}</p><small>◈ {Number(vehicle.price_coins).toLocaleString()} coins · {vehicle.price_cash.toLocaleString()} cash · {vehicle.stock_limit === null ? 'Unlimited stock' : Math.max(0, vehicle.stock_limit - vehicle.stock_sold) + ' remaining'} · {vehicle.is_available ? 'Available' : 'Hidden'}</small></div>
              <button type="button" disabled={busy} onClick={() => selectVehicle(vehicle)}>Edit</button>
            </article>)}
            {visibleVehicles.length === 0 && !vehicleLoadError && <p className="operator-help">No vehicles match this filter.</p>}
          </div>
        </>
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
