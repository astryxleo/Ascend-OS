import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Bell, CalendarClock, Info, Megaphone, RefreshCw, ShieldAlert, Wrench } from 'lucide-react';

type Broadcast = {
  id: string;
  title: string;
  message: string;
  kind: 'info' | 'exam' | 'urgent' | 'maintenance' | string;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
};

const kindMeta: Record<string, {label:string; icon: typeof Info}> = {
  info: {label:'INFORMATION',icon:Info},
  exam: {label:'EXAM UPDATE',icon:CalendarClock},
  urgent: {label:'IMPORTANT',icon:ShieldAlert},
  maintenance: {label:'SYSTEM NOTICE',icon:Wrench},
};

export default function UpdatesPanel({supabase}:{supabase:SupabaseClient|null}) {
  const [items,setItems]=useState<Broadcast[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [refreshing,setRefreshing]=useState(false);
  const requestId=useRef(0);

  const load=useCallback(async (quiet=false)=>{
    const request=++requestId.current;
    if(!supabase){setError('Connect Supabase to load workspace updates.');setLoading(false);setRefreshing(false);return;}
    if(quiet)setRefreshing(true);else setLoading(true);
    setError('');
    try {
      const now=new Date().toISOString();
      const {data,error:queryError}=await supabase.from('broadcasts')
        .select('id,title,message,kind,starts_at,ends_at,created_at')
        .eq('is_published',true)
        .lte('starts_at',now)
        .or('ends_at.is.null,ends_at.gt.'+now)
        .order('starts_at',{ascending:false})
        .limit(50);
      if(queryError)throw queryError;
      if(request!==requestId.current)return;
      setItems((data??[]) as Broadcast[]);
    } catch(reason) {
      if(request===requestId.current)setError(reason instanceof Error?reason.message:'Could not load updates.');
    } finally {if(request===requestId.current){setLoading(false);setRefreshing(false);}}
  },[supabase]);

  useEffect(()=>{void load();return()=>{requestId.current+=1}},[load]);
  useEffect(()=>{
    if(!supabase)return;
    const channel=supabase.channel('lumen-live-updates')
      .on('postgres_changes',{event:'*',schema:'public',table:'broadcasts'},()=>{void load(true);})
      .subscribe();
    return ()=>{void supabase.removeChannel(channel);};
  },[supabase,load]);

  return <section className="panel updates-panel">
    <div className="section-heading">
      <div><span className="eyebrow">CAMPUS SIGNAL · LIVE FEED</span><h2>Workspace updates</h2></div>
      <button className="updates-refresh" onClick={()=>void load(true)} disabled={loading||refreshing} aria-label="Refresh updates"><RefreshCw size={14} className={refreshing?'updates-spin':''}/>{refreshing?'Refreshing':'Refresh'}</button>
    </div>
    <p className="updates-intro">Announcements, exam notices and service updates published by the Lumen operator.</p>
    {error&&<div className="updates-error" role="alert"><span>{error}</span><button onClick={()=>void load(true)}>Try again</button></div>}
    {loading?<div className="updates-empty"><span className="updates-loader"/><b>Loading the latest signal…</b></div>:
      !error&&items.length===0?<div className="updates-empty"><div className="updates-empty-icon"><Bell size={21}/></div><b>You're all caught up.</b><span>New announcements will appear here when published.</span></div>:
      <div className="updates-list">{items.map(item=>{
        const meta=kindMeta[item.kind]??kindMeta.info;const Icon=meta.icon;
        return <article className={'update-card update-'+item.kind} key={item.id}>
          <div className="update-card-top"><span className="update-kind"><Icon size={13}/>{meta.label}</span><time dateTime={item.starts_at}>{new Date(item.starts_at).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</time></div>
          <h3>{item.title}</h3><p>{item.message}</p>
          <div className="update-card-foot"><span><Megaphone size={12}/> Lumen Operator</span>{item.ends_at&&<span>Until {new Date(item.ends_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}</span>}</div>
        </article>;
      })}</div>}
    <div className="updates-footnote"><span/> Feed refreshes automatically when announcements change.</div>
  </section>;
}
