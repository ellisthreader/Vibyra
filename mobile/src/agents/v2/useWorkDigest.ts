import {useEffect,useState} from 'react';
import {checkedDigest,type SignalsApi,type WorkDigest} from './signalsModel';
export function useWorkDigest(api:SignalsApi,id:string) {
 const [digest,setDigest]=useState<WorkDigest|null>(null),[error,setError]=useState(''),[version,setVersion]=useState(0);
 useEffect(()=>{let live=true;setDigest(null);setError('');void(async()=>{try{const next=checkedDigest(await api.digest(id),id);if(!live)return;setDigest(next);if(next.notificationId)await api.acknowledge(next.notificationId);}catch(e){if(live)setError(e instanceof Error?e.message:'The daily summary could not be loaded.');}})();return()=>{live=false;};},[api,id,version]);
 return {digest,error,refresh:()=>setVersion(v=>v+1)};
}
