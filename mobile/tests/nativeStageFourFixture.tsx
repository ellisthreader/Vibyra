import {registerRootComponent} from 'expo';
import {useEffect,useState} from 'react';
import {ScrollView,View,Text} from 'react-native';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import {palettes,ThemeContext} from '../src/theme';
import {Button} from '../src/ui/primitives';
import {CoreWork} from '../src/agents/work/CoreWork';
import {Proposals} from '../src/agents/work/Proposals';
import {SignalsWork} from '../src/agents/work/SignalsWork';
import {DigestDialog} from '../src/agents/work/DigestDialog';
import {appendDraftForScope,useDraft} from '../src/ui/useDraft';
import {subscribeNotificationNavigation} from '../src/notifications/navigation';
import {agentId,workFixture} from './agentWorkFixtureData';
const record=(event:string)=>void fetch('http://127.0.0.1:8202/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event})}).catch(()=>{});
function Fixture(){const [dark,setDark]=useState(true),[tab,setTab]=useState('Proposals'),[api]=useState(()=>workFixture(true,record));const [digest,setDigest]=useState<string|null>(null),[draft]=useDraft('vibes:stage-four-qa:starter',true),[result,setResult]=useState('');useEffect(()=>subscribeNotificationNavigation(d=>{record('exact-digest-task:'+d.runId);setResult('Opened exact task '+d.runId);setTab('Draft');}),[]);const colors=palettes[dark?'dark':'light'];return <SafeAreaProvider><ThemeContext.Provider value={{colors,dark}}><SafeAreaView style={{flex:1,backgroundColor:colors.background}}><View style={{padding:16,gap:8}}><Text style={{fontSize:20,color:colors.text}}>Stage 4 Work QA</Text><Text style={{color:colors.muted}}>Test data only · no real tasks or messages.</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{['Proposals','Goals','Suggestions'].map(name=><Button key={name} secondary title={name} onPress={()=>setTab(name)}/>)}<Button secondary title={dark?'Light':'Dark'} onPress={()=>setDark(!dark)}/></View></View><ScrollView contentContainerStyle={{padding:16,gap:16}} keyboardShouldPersistTaps="handled">{tab==='Proposals'&&<Proposals api={api} agentId={agentId} active disabled={false}/ >}{tab==='Goals'&&<CoreWork api={api.core} agentId={agentId} active disabled={false} onOpenRun={id=>record('open-run:'+id)}/ >}{tab==='Suggestions'&&<SignalsWork api={api.signals} agentId={agentId} active disabled={false} onDraft={prompt=>{record('prepare-draft');void appendDraftForScope('vibes:stage-four-qa:starter',prompt).then(()=>setTab('Draft'));}} onDigest={setDigest}/ >}{tab==='Draft'&&<><Text style={{color:colors.text}}>Prepared draft · review before Send</Text><Text selectable style={{color:colors.text}}>{draft}</Text><Button title="Send test task" onPress={()=>{record('explicit-test-send');setResult('Test result: reviewed two pull requests; one needs an owner decision. No repository changes made.');}}/><Text style={{color:colors.text}}>{result}</Text></>}</ScrollView>{digest&&<DigestDialog api={api.signals} id={digest} onClose={()=>setDigest(null)}/>}</SafeAreaView></ThemeContext.Provider></SafeAreaProvider>;}
registerRootComponent(Fixture);
