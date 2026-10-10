import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ScrollView,Text} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {palettes,ThemeContext} from '../src/theme';
import {CoreWork} from '../src/agents/work/CoreWork';
import {Proposals} from '../src/agents/work/Proposals';
import {SignalsWork} from '../src/agents/work/SignalsWork';
import {agentId,workFixture} from './agentWorkFixtureData';
function Fixture(){const [events,setEvents]=useState<string[]>([]),[api]=useState(()=>workFixture(true,e=>setEvents(v=>[...v,e]))),dark=!location.search.includes('light');return <ThemeContext.Provider value={{colors:palettes[dark?'dark':'light'],dark}}><SafeAreaProvider><ScrollView contentContainerStyle={{padding:20,paddingTop:40,gap:20,backgroundColor:dark?'#111':'#fff'}}><Text style={{fontSize:24,color:dark?'white':'black'}}>Work · Launch assistant</Text><Proposals api={api} agentId={agentId} active disabled={false}/><CoreWork api={api.core} agentId={agentId} active disabled={false} onOpenRun={id=>setEvents(v=>[...v,'open-run:'+id])}/><SignalsWork api={api.signals} agentId={agentId} active disabled={false} onDraft={()=>setEvents(v=>[...v,'prepare-draft'])} onDigest={id=>setEvents(v=>[...v,'open-digest:'+id])}/><Text testID="events" style={{color:dark?'white':'black'}}>{events.join('|')}</Text></ScrollView></SafeAreaProvider></ThemeContext.Provider>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
