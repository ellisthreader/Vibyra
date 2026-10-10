import { DigestDialog } from './DigestDialog';
import {useRef,Fragment,useState,type ReactNode} from 'react';
import {View,Text} from 'react-native';
import {Hint} from '../../ui/primitives';
import {useTheme} from '../../theme';
import {appendDraftForScope} from '../../ui/useDraft';
import type {StageFourApi} from '../v2/stageFourClient';
import type {Teammate} from '../types';
import {CoreWork} from './CoreWork';
import {SignalsWork} from './SignalsWork';
import {Proposals} from './Proposals';
export function WorkPanel({api,agent,identity,active,disabled,routines,onOpenRun,onOpenChat}:{api:StageFourApi;agent:Teammate;identity:string;active:boolean;disabled:boolean;routines:ReactNode;onOpenRun?(id:string):void;onOpenChat?():void;onDigest?(id:string):void}) {
 const [digest,setDigest]=useState<string|null>(null);
 const {colors}=useTheme(),[error,setError]=useState(''),[busy,setBusy]=useState(false),lock=useRef(false);
 const prepare=async(prompt:string)=>{if(lock.current||disabled)return;lock.current=true;setBusy(true);try{await appendDraftForScope(`vibes:${identity}:${agent.chatId}`,prompt);setError('');onOpenChat?.();}catch(e){setError(e instanceof Error?e.message:'The draft could not be saved.');}finally{lock.current=false;setBusy(false);}};
 const [refreshVersion,setRefreshVersion]=useState(0),[routineVersion,setRoutineVersion]=useState(0);
 return <View style={{gap:20}}>{error&&<Hint error>{error}</Hint>}<Proposals api={api} agentId={agent.id} active={active} disabled={disabled} onChanged={kind=>{setRefreshVersion(v=>v+1);if(kind==='routine')setRoutineVersion(v=>v+1);}}/><CoreWork refreshVersion={refreshVersion} api={api.core} agentId={agent.id} active={active} disabled={disabled} onOpenRun={onOpenRun}/><Text accessibilityRole="header" style={{color:colors.text,fontSize:20,fontWeight:'600'}}>Routines</Text><Fragment key={routineVersion}>{routines}</Fragment><SignalsWork api={api.signals} agentId={agent.id} active={active} disabled={disabled||busy} onDraft={prompt=>void prepare(prompt)} onDigest={setDigest}/>{digest&&<DigestDialog api={api.signals} id={digest} onClose={()=>setDigest(null)}/>}</View>;
}
