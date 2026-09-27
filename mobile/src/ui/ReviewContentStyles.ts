import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  fill: { flex: 1 },
  breadcrumb: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  path: { flex: 1, fontFamily: 'Menlo', fontSize: 12, lineHeight: 17 },
  loading: { padding: 40, alignItems: 'center', gap: 16 },
  notice: { paddingHorizontal: 20, paddingVertical: 14 },
  files: { paddingHorizontal: 20, paddingBottom: 24 },
  file: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fileName: { flex: 1, fontSize: 15, lineHeight: 20, letterSpacing: -0.2 },
  size: { fontSize: 12, fontVariant: ['tabular-nums'] },
});
