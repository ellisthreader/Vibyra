import {Modal,ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Button,Hint} from '../../ui/primitives';
import {useTheme} from '../../theme';
import {routeToRun} from '../../notifications/navigation';
import {useWorkDigest} from '../v2/useWorkDigest';
import type {SignalsApi} from '../v2/signalsModel';
export function DigestDialog({api,id,onClose}:{api:SignalsApi;id:string;onClose():void}) {
 const {colors}=useTheme(),{digest,error,refresh}=useWorkDigest(api,id);
 return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><SafeAreaView style={{flex:1,backgroundColor:colors.background}}><View style={{padding:16,flexDirection:'row',justifyContent:'space-between'}}><Text accessibilityRole="header" style={{color:colors.text,fontSize:22}}>Daily summary</Text><Button secondary title="Done" onPress={onClose}/></View><ScrollView contentContainerStyle={{padding:16,gap:12}}>{error&&<Hint error>{error}</Hint>}{digest&&<><Hint>{digest.date} · {digest.timezone}</Hint>{digest.items.map(item=><View key={item.notificationId}><Text style={{color:colors.text}}>{item.title}</Text><Button secondary title="Open exact task" onPress={()=>{onClose();routeToRun({source:'agent_run',agentId:item.agentId,runId:item.runId,conversationId:item.conversationId});}}/></View>)}{!digest.items.length&&<Hint>No unread current updates remain in this summary.</Hint>}</>}<Button secondary title="Refresh daily summary" onPress={refresh}/></ScrollView></SafeAreaView></Modal>;
}
