import { StyleSheet } from 'react-native';

export const inspectorStyles = StyleSheet.create({
  inline: {
    maxHeight: 280,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 8,
  },
  inlineHeader: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16 },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { gap: 14, padding: 20, paddingBottom: 48 },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, lineHeight: 20, letterSpacing: -0.2 },
  caption: { fontSize: 13, lineHeight: 18 },
  output: { fontFamily: 'Menlo', fontSize: 12.5, lineHeight: 19 },
  search: {
    minHeight: 44,
    borderRadius: 11,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  model: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    letterSpacing: -0.05,
    marginTop: 12,
  },
  efforts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  effort: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 10,
  },
});
