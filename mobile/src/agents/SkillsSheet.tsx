import { VibesError } from '../vibes/api';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { readFlag, writeFlag } from '../transport/deviceFlags';
import { useTheme } from '../theme';
import { Sheet } from '../ui/Sheet';
import { Button, Hint } from '../ui/primitives';
import type { AgentSkill, AgentsApi, Teammate } from './types';
export function SkillsSheet({ visible, api, identity, teammates, onClose }: { visible: boolean; api: AgentsApi; identity: string; teammates: Teammate[]; onClose(): void }) {
  const { colors } = useTheme(); const [skills, setSkills] = useState<AgentSkill[]>([]), [draft, setDraft] = useState<AgentSkill | null>(null);
  const [pending, setPending] = useState<AgentSkill | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false);
  const key = `agent-skill-save.${encodeURIComponent(identity)}`;
  useEffect(() => { if (!visible) return; let alive = true;
    void api.skills?.().then(rows => { if (alive) setSkills(rows); }).catch(e => { if (alive) setError(String(e)); });
    void readFlag(key).then(value => { if (alive && value) { try { const saved = JSON.parse(value); if (!saved || typeof saved.id !== 'string' || typeof saved.name !== 'string' || typeof saved.instructions !== 'string' || !Array.isArray(saved.teammateIds)) throw new Error('Invalid saved skill'); setPending(saved); } catch { setError('Saved skill request is damaged.'); } } });
    return () => { alive = false; };
  }, [visible, api, key]);
  const current = pending ?? draft;
  const save = async () => { if (!current || lock.current || !api.saveSkill) return; lock.current = true; setBusy(true); setError(''); try {
    await writeFlag(key, JSON.stringify(current)); setPending(current);
    const saved = await api.saveSkill(current); await writeFlag(key, ''); setPending(null); setDraft(null); setSkills(rows => [saved, ...rows.filter(s => s.id !== saved.id)]);
  } catch(e) { if (e instanceof VibesError && e.status >= 400 && e.status < 500) { await writeFlag(key, ''); setPending(null); setDraft(current); void api.skills?.().then(setSkills).catch(() => {}); } setError(e instanceof Error ? e.message : 'Skill could not be saved.'); } finally { lock.current = false; setBusy(false); } };
  return <Sheet title="Skills" visible={visible} onClose={onClose} scroll={false}><ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
    {current ? <><Text style={{color:colors.text}}>Name</Text><TextInput accessibilityLabel="Skill name" editable={!pending && !busy} value={current.name} onChangeText={name => setDraft({...current,name})} style={[s.field,{color:colors.text,borderColor:colors.border}]} />
      <Text style={{color:colors.text}}>Instructions</Text><TextInput accessibilityLabel="Skill instructions" multiline maxLength={4000} editable={!pending && !busy} value={current.instructions} onChangeText={instructions => setDraft({...current,instructions})} style={[s.field,s.instructions,{color:colors.text,borderColor:colors.border}]} />
      <Text style={{color:colors.text}}>Assign to teammates</Text>{teammates.filter(a=>!a.archived).map(a=><Pressable key={a.id} accessibilityRole="checkbox" accessibilityState={{checked:current.teammateIds.includes(a.id),disabled:Boolean(pending)||busy}} disabled={Boolean(pending)||busy} onPress={()=>setDraft({...current,teammateIds:current.teammateIds.includes(a.id)?current.teammateIds.filter(id=>id!==a.id):[...current.teammateIds,a.id]})} style={[s.row,{backgroundColor:current.teammateIds.includes(a.id)?colors.elevated:'transparent'}]}><Text style={{color:colors.text}}>{current.teammateIds.includes(a.id)?'✓ ':''}{a.name}</Text></Pressable>)}
      <Hint>Instructions do not grant tool access. Stop affected tasks before saving.</Hint><Button title={pending?'Retry exact save':'Save skill'} busy={busy} disabled={!current.name.trim()||!current.instructions.trim()} onPress={()=>void save()} />{!pending&&<Button title="Back to skills" secondary onPress={()=>setDraft(null)} />}
    </> : <>{skills.map(skill=><Pressable key={skill.id} accessibilityRole="button" onPress={()=>setDraft(skill)} style={s.row}><Text style={{color:colors.text}}>{skill.name}</Text></Pressable>)}<Button title="New skill" onPress={()=>setDraft({id:randomUUID(),revision:0,name:'',instructions:'',teammateIds:[]})} /></>}
    {error&&<Hint error>{error}</Hint>}
  </ScrollView></Sheet>;
}
const s=StyleSheet.create({body:{padding:20,gap:14},field:{borderWidth:1,borderRadius:7,padding:12,fontSize:15},instructions:{minHeight:130,textAlignVertical:'top'},row:{minHeight:44,padding:12,borderRadius:7}});
