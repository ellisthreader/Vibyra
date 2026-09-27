import { StyleSheet } from 'react-native';
import { font } from '../ui/font';

export const styles = StyleSheet.create({
  label: { ...font.section, marginTop: 26, marginBottom: 7, marginLeft: 16 },
  first: { marginTop: 6 },
  group: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  rule: { height: StyleSheet.hairlineWidth },
  row: {
    minHeight: 52,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tall: { minHeight: 62, paddingVertical: 10 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  center: { alignItems: 'center' },
  title: { fontSize: 16, letterSpacing: -0.3 },
  dangerTitle: { fontWeight: '600', textAlign: 'center' },
  detail: { fontSize: 13, lineHeight: 18 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1, maxWidth: '55%' },
  value: { fontSize: 15, flexShrink: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
  dot: { width: 7, height: 7, borderRadius: 4 },
  trail: { opacity: 0.7 },
  footnote: { ...font.footnote, marginTop: 8, marginHorizontal: 16 },
});
