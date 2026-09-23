import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 4 },
  option: {
    minHeight: 62,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  optionText: { flex: 1, minWidth: 0, gap: 2 },
  optionTitle: { fontSize: 16, letterSpacing: -0.2 },
  optionDetail: { fontSize: 13, lineHeight: 18 },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  input: { minHeight: 88, fontSize: 15.5, lineHeight: 22, padding: 0, outlineWidth: 0 },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 26,
    marginTop: 6,
  },
  count: { fontSize: 12, fontVariant: ['tabular-nums'] },
  status: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  saved: { fontSize: 13 },
  done: { fontSize: 15, fontWeight: '600' },
  error: { marginTop: 10, marginHorizontal: 16 },
});
