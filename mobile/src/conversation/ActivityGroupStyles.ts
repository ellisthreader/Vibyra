import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  summary: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    gap: 8,
  },
  live: { flexShrink: 1 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500', letterSpacing: -0.15, flexShrink: 1 },
  count: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  steps: {
    borderLeftWidth: StyleSheet.hairlineWidth * 2,
    marginLeft: 6,
    paddingLeft: 16,
    paddingBottom: 6,
  },
  preview: { fontSize: 14, lineHeight: 21, paddingLeft: 18, marginBottom: 4 },
  note: { paddingVertical: 10 },
  noteText: { fontSize: 15, lineHeight: 23, letterSpacing: -0.2 },
  step: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 9 },
  stepText: { fontSize: 14, lineHeight: 20, letterSpacing: -0.1, flex: 1 },
  detail: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    fontFamily: 'Menlo',
    fontSize: 12,
    lineHeight: 18,
    marginVertical: 4,
  },
  reasoning: {
    fontFamily: undefined,
    fontSize: 15,
    lineHeight: 24,
    paddingHorizontal: 0,
    paddingVertical: 4,
  },
});
