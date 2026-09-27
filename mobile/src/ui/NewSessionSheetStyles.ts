import { StyleSheet } from 'react-native';
import { font } from './font';

export const styles = StyleSheet.create({
  content: { gap: 20, paddingTop: 12 },
  context: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  project: { ...font.footnote, flex: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  hero: { gap: 8, paddingTop: 8, paddingBottom: 6 },
  title: { ...font.display },
  subtitle: { ...font.subhead },
  choices: { gap: 2 },
  choice: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 12 },
  back: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
  },
  backText: { ...font.row },
  note: { ...font.caption, textAlign: 'center' },
});
