import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { font, radius } from '../ui/font';
import { Icon } from '../ui/primitives';
import { ConversationText } from './ConversationText';
import type { ConversationActivity } from './types';

type Task = { done: boolean; active: boolean; text: string };
/** "- [x] done", "- [~] in progress", "- [ ] to do": the agent's own task list. */
export function planTasks(text: string): Task[] | null {
  const lines = text.split('\n').filter((line) => line.trim());
  const tasks = lines.map((line) => /^\s*[-*]\s*\[([ xX~])\]\s+(.+)$/.exec(line));
  if (!tasks.length || tasks.some((task) => !task)) return null;
  return tasks.map((task) => ({ done: /x/i.test(task![1]), active: task![1] === '~', text: task![2] }));
}

/** The agent's plan, as one checklist that updates in place. */
export function PlanChecklist({ item }: { item: ConversationActivity }) {
  const { colors } = useTheme();
  const text = item.detail ?? '';
  const tasks = planTasks(text);
  const done = tasks?.filter((task) => task.done).length ?? 0;
  return (
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={s.head}>
        <Icon name="list-outline" size={15} color={colors.muted} />
        <Text style={[s.title, { color: colors.text }]}>Plan</Text>
        {tasks && <Text style={[s.progress, { color: colors.muted }]}>{done} of {tasks.length} done</Text>}
      </View>
      {tasks ? tasks.map((task, index) => (
        <View key={index} style={s.task} accessible accessibilityLabel={`${task.text}, ${task.done ? 'done' : task.active ? 'in progress' : 'to do'}`}>
          <Icon name={task.done ? 'checkmark-circle' : task.active ? 'ellipse' : 'ellipse-outline'} size={16}
            color={task.done ? colors.success : task.active ? colors.accent : colors.muted} />
          <Text style={[s.taskText, { color: task.done ? colors.muted : colors.text },
            task.done && s.struck, task.active && s.active]}>{task.text}</Text>
        </View>
      )) : <ConversationText text={text} />}
    </View>
  );
}
const s = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...font.row, flex: 1 },
  progress: { ...font.caption, fontVariant: ['tabular-nums'] },
  task: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  taskText: { ...font.subhead, flex: 1, marginTop: -1 },
  struck: { textDecorationLine: 'line-through' },
  active: { fontWeight: '600' },
});
