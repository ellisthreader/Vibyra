import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { Button, Hint, Icon } from '../ui/primitives';
import { Sheet } from '../ui/Sheet';

export function DemoPreviewSheet({ visible, onClose, onFeedback }: {
  visible: boolean; onClose: () => void; onFeedback: (value: string) => void;
}) {
  const { colors } = useTheme();
  const [feedback, setFeedback] = useState('');
  const [continued, setContinued] = useState(false);
  return <Sheet title="Example preview" visible={visible} onClose={onClose}>
    <Hint>Static sample · No live site or purchase.</Hint>
    <View style={s.browser}>
      <View style={s.address}><Icon name="globe-outline" size={13} color="#74746F" /><Text style={s.addressText}>studio.example / checkout</Text></View>
      <View style={s.store}>
        <View style={s.storeHeader}><Text style={s.wordmark}>studio.</Text><Icon name="bag-outline" size={19} color="#252B27" /></View>
        <Text style={s.eyebrow}>THOUGHTFULLY MADE. EVERY DAY.</Text>
        <Text style={s.headline}>Make it yours.</Text>
        <Text style={s.description}>A little space for your next big idea.</Text>
        <View style={s.product}>
          <View style={s.productArt}><View style={s.book}><View style={s.bookSpine} /><Text style={s.bookLabel}>room for{ '\n' }a little more.</Text><View style={s.bookDot} /></View></View>
          <View style={s.productInfo}><Text style={s.productName}>The everyday notebook</Text><Text style={s.productDetail}>Sage · Dotted pages</Text><Text style={s.productPrice}>£24.00</Text></View>
        </View>
        <View style={s.summary}><View style={s.summaryRow}><Text style={s.summaryLabel}>Subtotal</Text><Text style={s.summaryValue}>£24.00</Text></View>
          <View style={s.summaryRow}><Text style={s.summaryLabel}>Delivery</Text><Text style={s.summaryValue}>On us</Text></View>
          <View style={[s.summaryRow, s.total]}><Text style={s.totalText}>Total</Text><Text style={s.totalText}>£24.00</Text></View></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Try sample checkout button" onPress={() => setContinued(true)} style={s.checkout}>
          <Text style={s.checkoutText}>{continued ? 'Sample interaction complete' : 'Continue to checkout'}</Text>
          <Icon name={continued ? 'checkmark' : 'arrow-forward'} size={17} color="#FFFFFF" />
        </Pressable>
        <Text accessibilityLiveRegion="polite" style={s.sampleNote}>{continued ? 'This is a design example. No order was placed.' : 'Example storefront · Nothing is for sale'}</Text>
      </View>
    </View>
    <Text style={[s.feedbackLabel, { color: colors.text }]}>What would you change?</Text>
    <TextInput value={feedback} onChangeText={setFeedback} multiline placeholder="A little more space around the summary…"
      placeholderTextColor={colors.muted} accessibilityLabel="Feedback on example preview"
      style={[s.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]} />
    <Button title="Add feedback to task" icon="arrow-up-outline" disabled={!feedback.trim()}
      onPress={() => { onFeedback(`About the example preview: ${feedback.trim()}`); setFeedback(''); }} />
    <Hint>Your feedback returns to the same task as a draft.</Hint>
  </Sheet>;
}
const s = StyleSheet.create({
  browser: { borderRadius: 20, overflow: 'hidden', backgroundColor: '#FBFBF7', borderColor: '#DADDD6', borderWidth: StyleSheet.hairlineWidth },
  address: { backgroundColor: '#EFF0EA', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, padding: 12 },
  addressText: { fontSize: 11, color: '#686F65' }, store: { padding: 22 }, storeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 33 },
  wordmark: { fontSize: 25, letterSpacing: -1.1, fontWeight: '600', color: '#252B27' }, eyebrow: { fontSize: 9, letterSpacing: 1.2, color: '#626B60', fontWeight: '500' },
  headline: { color: '#252B27', fontSize: 30, lineHeight: 38, fontWeight: '500', letterSpacing: -1.2, marginTop: 10 }, description: { color: '#626B60', fontSize: 12, lineHeight: 20, marginTop: 5 },
  product: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 27, marginBottom: 24 },
  productArt: { width: 80, height: 93, borderRadius: 12, backgroundColor: '#ECEFE7', alignItems: 'center', justifyContent: 'center' },
  book: { width: 46, height: 63, backgroundColor: '#829583', borderRadius: 3, transform: [{ rotate: '-10deg' }], padding: 7, justifyContent: 'space-between' },
  bookSpine: { position: 'absolute', left: 3, width: 1, top: 0, bottom: 0, backgroundColor: '#647965' }, bookLabel: { fontSize: 5, lineHeight: 7, color: '#FCFBED', marginTop: 11 }, bookDot: { height: 4, width: 4, borderRadius: 2, backgroundColor: '#FCFBED' },
  productInfo: { flex: 1, gap: 7 }, productName: { fontSize: 13, lineHeight: 20, fontWeight: '500', color: '#252B27' }, productDetail: { fontSize: 11, color: '#626B60' }, productPrice: { fontSize: 12, fontWeight: '500', color: '#252B27', marginTop: 3 },
  summary: { gap: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#DADDD6', paddingTop: 20 }, summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  summaryLabel: { fontSize: 12, color: '#626B60' }, summaryValue: { fontSize: 12, color: '#252B27' }, total: { paddingTop: 14, marginTop: 1, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#DADDD6' }, totalText: { fontSize: 16, color: '#252B27', fontWeight: '500' },
  checkout: { minHeight: 47, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: '#344D3D', borderRadius: 12, marginTop: 22, paddingHorizontal: 10 },
  checkoutText: { fontSize: 12, color: '#FFFFFF', fontWeight: '500', flexShrink: 1 }, sampleNote: { fontSize: 9, lineHeight: 15, textAlign: 'center', color: '#626B60', paddingTop: 13 },
  feedbackLabel: { fontSize: 17, fontWeight: '600', marginTop: 8 }, input: { fontSize: 16, lineHeight: 24, minHeight: 96, borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 17, textAlignVertical: 'top' },
});
