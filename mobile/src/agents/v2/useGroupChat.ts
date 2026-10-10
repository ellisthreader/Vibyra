import {useEffect,useState,useSyncExternalStore} from 'react';
import type {CoordinationApi} from './coordinationModel';
import {GroupChatStore} from './groupChatStore';
import type {GroupPersistence} from './groupChatStore';
export function useGroupChat(api:CoordinationApi,id:string,saved:GroupPersistence,uuid:()=>string,active:boolean){
 const [store]=useState(()=>new GroupChatStore(api,id,saved,uuid)),state=useSyncExternalStore(store.subscribe,store.snapshot);
 useEffect(()=>{void store.initialize();return()=>store.dispose();},[store]);
 useEffect(()=>{if(!active)return;void store.refresh();const timer=setInterval(()=>void store.refresh(),5000);return()=>clearInterval(timer);},[store,active]);
 return {store,state};
}
