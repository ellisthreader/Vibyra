import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  heading: { alignItems: 'center', gap: 6 },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: -0.55,
    textAlign: 'center',
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  detail: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  points: { gap: 16, paddingHorizontal: 2 },
  detailsToggle: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  pointText: { flex: 1, gap: 2 },
  pointTitle: { fontSize: 15, lineHeight: 20, fontWeight: '600', letterSpacing: -0.2 },
  pointBody: { fontSize: 13.5, lineHeight: 18.5 },
  consent: { fontSize: 12.5, lineHeight: 18, textAlign: 'center', paddingHorizontal: 8 },
  note: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.1,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  link: { fontWeight: '600' },
  textAction: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  textActionLabel: { fontSize: 16, fontWeight: '600', letterSpacing: -0.25 },
});
