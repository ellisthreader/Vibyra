import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  card: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 390,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    alignItems: 'center',
    gap: 12,
  },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.8, textAlign: 'center' },
  lead: { fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 280 },
  singleSize: { fontSize: 13, lineHeight: 18, fontWeight: '600', marginTop: 4 },
  allowance: { alignItems: 'center', marginTop: 8 },
  amount: { fontSize: 42, lineHeight: 48, fontWeight: '700', letterSpacing: -1.7, fontVariant: ['tabular-nums'] },
  unit: { fontSize: 14, lineHeight: 20 },
  details: { alignSelf: 'stretch', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 15, gap: 9, marginTop: 6 },
  detail: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  notice: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  action: { alignSelf: 'stretch', marginTop: 8 },
  terms: { fontSize: 12, lineHeight: 17, textAlign: 'center', maxWidth: 300 },
  previewAction: { alignSelf: 'center', minHeight: 36, justifyContent: 'center' },
  preview: { fontSize: 12, lineHeight: 18, textDecorationLine: 'underline', textAlign: 'center' },
});
