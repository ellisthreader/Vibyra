import { StyleSheet } from 'react-native';
import { font } from './font';

export const styles = StyleSheet.create({
  body: { flex: 1, minHeight: 0 },
  heading: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 22,
    paddingRight: 6,
  },
  headingText: { ...font.headline, flex: 1 },
  section: { ...font.section, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8 },
  list: { paddingHorizontal: 12, paddingBottom: 16 },
  group: { marginBottom: 2 },
  project: {
    minHeight: 46,
    paddingLeft: 8,
    paddingRight: 12,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  projectIcon: { width: 22, alignItems: 'center' },
  title: { ...font.row, flex: 1 },
  live: { width: 7, height: 7, borderRadius: 4 },
  count: { ...font.footnote, fontVariant: ['tabular-nums'] },
  sessions: { paddingLeft: 30, paddingTop: 2, paddingBottom: 6, gap: 1 },
  empty: { ...font.footnote, paddingHorizontal: 20, paddingVertical: 14 },
  pager: { height: 50, marginHorizontal: 12, borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  pageArrow: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  pageNumber: { ...font.footnote, minWidth: 48, textAlign: 'center', fontVariant: ['tabular-nums'] },
  footer: { paddingHorizontal: 12, paddingTop: 10, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
});
