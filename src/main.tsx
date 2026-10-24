import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

function OfflineStatus() {
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);
  if (!offline) return null;
  return <div role="status" aria-live="polite" style={{position:'fixed',top:12,left:'50%',transform:'translateX(-50%)',zIndex:2147483000,width:'max-content',maxWidth:'calc(100vw - 24px)',boxSizing:'border-box',display:'flex',alignItems:'center',gap:10,padding:'10px 15px',border:'1px solid rgba(231,199,123,.32)',borderRadius:14,background:'rgba(12,12,17,.94)',backdropFilter:'blur(18px)',boxShadow:'0 12px 36px rgba(0,0,0,.38)',color:'#f0dba7',fontFamily:'Manrope,system-ui,sans-serif',fontSize:12,fontWeight:700}}><span aria-hidden="true" style={{width:7,height:7,flex:'0 0 7px',borderRadius:'50%',background:'#e7c779',boxShadow:'0 0 12px #e7c779'}} />Offline mode <span style={{fontWeight:500,color:'#aaa6b7'}}>· Saved interface available; live sync needs internet.</span></div>;
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><><OfflineStatus /><App /></></React.StrictMode>,
);
