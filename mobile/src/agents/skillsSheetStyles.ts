import { StyleSheet } from 'react-native';
import { font } from '../ui/font';

export const skillsSheetStyles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40, gap: 20 },
  row: {
    minHeight: 52,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  name: { ...font.row, fontSize: 16, flex: 1 },
  glyph: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  actions: { gap: 10 },
});
