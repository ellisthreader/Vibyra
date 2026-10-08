import {useDialogFocus} from '../useDialogFocus';
import {runNotificationAction} from '../../../lib/notificationActions';
import {useWorkDigest} from '../../../../../mobile/src/agents/v2/useWorkDigest';
import type {SignalsApi} from '../../../../../mobile/src/agents/v2/signalsModel';
export function DigestDialog({api,id,identity,onClose}:{api:SignalsApi;id:string;identity:string;onClose():void}) {
 const dialog=useDialogFocus(true,onClose),{digest,error,refresh}=useWorkDigest(api,id);
 return <div className="focus-dialog-backdrop"><section ref={node=>{dialog.current=node;}} className="focus-dialog teammate-setup" role="dialog" aria-modal="true" aria-label="Daily summary"><header><h2>Daily summary</h2><button type="button" onClick={onClose}>Done</button></header><div style={{overflow:'auto',padding:16}}>{error&&<p role="alert">{error}</p>}{digest&&<><p>{digest.date} · {digest.timezone}</p>{digest.items.map(item=><article className="agent-work-card" key={item.notificationId}><p>{item.title}</p><button type="button" onClick={()=>{onClose();runNotificationAction({id:'openTeammate',label:'Open exact task',arg:item.agentId,runId:item.runId,account:identity});}}>Open exact task</button></article>)}{!digest.items.length&&<p>No unread current updates remain in this summary.</p>}</>}<button type="button" onClick={refresh}>Refresh daily summary</button></div></section></div>;
}
