import { useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { mockIPC } from '@tauri-apps/api/mocks';
import { BetaWelcome } from '../src/components/beta/BetaWelcome';
import { useBetaWelcome } from '../src/lib/useBetaWelcome';
import { useAccountStore } from '../src/state/accountStore';
import { useReportStore } from '../src/state/reportStore';
import { useWorkspaceStore } from '../src/state/workspaceStore';
import { useModalFocus } from '../src/lib/useModalFocus';
import type { AccountProfile } from '../src/accountTypes';
import '../src/styles/tokens.css';
import '../src/styles/workspace-font.css';
const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.get('theme') || 'dark';
const calls: string[] = [];
let failAck = query.has('offline');
mockIPC((command) => { calls.push(command); if (command === 'account_license_welcome' && failAck) throw new Error('offline'); return null; });
const profile = { name:query.get('name') || 'Ellis Threader', emailVerified:true, welcomeKey:'beta-fixture-account', license:{ tokens:300, allowance:'once', nextAt:null, endsAt:'2999-11-02T12:00:00Z', betaWelcome:{id:'00000000-0000-4000-8000-000000000001',months:query.has('fixed') ? null : 1} } } as AccountProfile;
useAccountStore.setState({snapshot:{status:'signedIn',profile,secureStorage:true,error:null,pendingProvider:null}});
function OtherDialog() {
 const ref=useRef<HTMLElement>(null), close=()=>useWorkspaceStore.setState({settingsOpen:false});
 useModalFocus(ref,true,close);
 return <section ref={ref} role="dialog" aria-label="Settings" style={{position:'fixed',zIndex:130,top:100,left:100,background:'#fff',color:'#111',padding:30}}><button onClick={close}>Close Settings</button></section>;
}
function Fixture() {
 const profile=useAccountStore(s=>s.snapshot.profile), settings=useWorkspaceStore(s=>s.settingsOpen), report=useReportStore(s=>s.open);
 const [ready,setReady]=useState(!query.has('onboarding'));
 const beta=useBetaWelcome(profile,ready);
 (window as any).betaTest={calls,expire:()=>useAccountStore.setState(s=>({snapshot:{...s.snapshot,profile:{...s.snapshot.profile!,license:{...s.snapshot.profile!.license!,endsAt:new Date(Date.now()+100).toISOString()}}}})),online:()=>{failAck=false;window.dispatchEvent(new Event('focus'));},settings:()=>useWorkspaceStore.setState({settingsOpen:true}),profile:(change:Partial<AccountProfile>)=>useAccountStore.setState(s=>({snapshot:{...s.snapshot,profile:{...s.snapshot.profile!,...change}}})),ready:()=>setReady(true)};
 return <div className="app"><div className="chrome">Vibyra</div><div className="shell" style={{padding:80,minHeight:'100vh',background:'var(--bg)',color:'var(--text)'}}><button id="opener">Terminal workspace</button><p>Existing project and terminals stay here.</p></div>
  {beta.open && profile && beta.receipt && <BetaWelcome name={profile.name} receipt={beta.receipt} onDismiss={beta.dismiss} onReport={()=>{beta.dismiss();void useReportStore.getState().begin();}} />}
  {settings && <OtherDialog />}
  {report && <section role="dialog" aria-label="Report a problem"><button onClick={()=>useReportStore.setState({open:false})}>Close report</button></section>}
  {!beta.pending && !beta.priorityBlocked && <div data-next-notice>Next promotional notice</div>}
 </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
