import { browserChild } from './agent-process.mjs';
const OFF = Object.freeze({browserTools:false,cloudPrivateBrowserV1:false,browserWorkflowsV1:false,browserUploadsV1:false});
/** Browser credentials, profile and uid never enter an AI worker or its environment. */
export function browserSupervisor({bin,home,uid=null,gid=null,origin,valid,child=browserChild}) {
  let epoch=0, pending=null, capabilities=OFF;
  async function stop(){epoch++;await pending?.catch(()=>{});pending=null;}
  return {
    async probe(){
      await stop(); capabilities=OFF;
      if(!bin||!home)return capabilities;
      const started=epoch;
      try {
        const result=JSON.parse(await child({bin,home,uid,gid,args:['--probe'],input:{},timeout:90000,valid:()=>valid()&&started===epoch}));
        if(result.browserTools===true) capabilities={browserTools:true,cloudPrivateBrowserV1:true,browserWorkflowsV1:true,browserUploadsV1:true};
      } catch { /* No sandbox or browser means no advertised browser authority. */ }
      return capabilities;
    },
    start(runtimeId,browserKey){
      if(pending||!capabilities.browserTools||typeof browserKey!=='string'||!/^[a-zA-Z0-9]{64}$/.test(browserKey))return;
      const started=epoch;
      pending=child({bin,home,uid,gid,args:[],input:{origin,runtimeId,browserKey},valid:()=>valid()&&started===epoch})
        .catch(()=>{}).finally(()=>{pending=null;});
    },stop,
  };
}
