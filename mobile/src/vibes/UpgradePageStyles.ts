import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  hero: { alignItems: 'center' },
  title: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    letterSpacing: -1,
    textAlign: 'center',
    marginTop: 16,
  },
  lead: {
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: -0.2,
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 340,
  },
  titleShort: { marginTop: 10 },
  tabs: { alignSelf: 'stretch', marginTop: 20 },
  tabsShort: { marginTop: 10 },
  notice: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  terms: { fontSize: 12, lineHeight: 16, textAlign: 'center' },
});
