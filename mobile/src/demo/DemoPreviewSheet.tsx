import { styles as s } from './DemoPreviewSheetStyles';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { Button, Hint, Icon } from '../ui/primitives';
import { Sheet } from '../ui/Sheet';

export function DemoPreviewSheet({
  visible,
  onClose,
  onFeedback,
}: {
  visible: boolean;
  onClose: () => void;
  onFeedback: (value: string) => void;
}) {
  const { colors } = useTheme();
  const [feedback, setFeedback] = useState('');
  const [continued, setContinued] = useState(false);
  return (
    <Sheet title="Example preview" visible={visible} onClose={onClose}>
      <Hint>Static sample · No live site or purchase.</Hint>
      <View style={s.browser}>
        <View style={s.address}>
          <Icon name="globe-outline" size={13} color="#74746F" />
          <Text style={s.addressText}>studio.example / checkout</Text>
        </View>
        <View style={s.store}>
          <View style={s.storeHeader}>
            <Text style={s.wordmark}>studio.</Text>
            <Icon name="bag-outline" size={19} color="#252B27" />
          </View>
          <Text style={s.eyebrow}>THOUGHTFULLY MADE. EVERY DAY.</Text>
          <Text style={s.headline}>Make it yours.</Text>
          <Text style={s.description}>A little space for your next big idea.</Text>
          <View style={s.product}>
            <View style={s.productArt}>
              <View style={s.book}>
                <View style={s.bookSpine} />
                <Text style={s.bookLabel}>room for{'\n'}a little more.</Text>
                <View style={s.bookDot} />
              </View>
            </View>
            <View style={s.productInfo}>
              <Text style={s.productName}>The everyday notebook</Text>
              <Text style={s.productDetail}>Sage · Dotted pages</Text>
              <Text style={s.productPrice}>£24.00</Text>
            </View>
          </View>
          <View style={s.summary}>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Subtotal</Text>
              <Text style={s.summaryValue}>£24.00</Text>
            </View>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Delivery</Text>
              <Text style={s.summaryValue}>On us</Text>
            </View>
            <View style={[s.summaryRow, s.total]}>
              <Text style={s.totalText}>Total</Text>
              <Text style={s.totalText}>£24.00</Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try sample checkout button"
            onPress={() => setContinued(true)}
            style={s.checkout}
          >
            <Text style={s.checkoutText}>
              {continued ? 'Sample interaction complete' : 'Continue to checkout'}
            </Text>
            <Icon name={continued ? 'checkmark' : 'arrow-forward'} size={17} color="#FFFFFF" />
          </Pressable>
          <Text accessibilityLiveRegion="polite" style={s.sampleNote}>
            {continued
              ? 'This is a design example. No order was placed.'
              : 'Example storefront · Nothing is for sale'}
          </Text>
        </View>
      </View>
      <Text style={[s.feedbackLabel, { color: colors.text }]}>What would you change?</Text>
      <TextInput
        value={feedback}
        onChangeText={setFeedback}
        multiline
        placeholder="A little more space around the summary…"
        placeholderTextColor={colors.muted}
        accessibilityLabel="Feedback on example preview"
        style={[
          s.input,
          { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      />
      <Button
        title="Add feedback to task"
        icon="arrow-up-outline"
        disabled={!feedback.trim()}
        onPress={() => {
          onFeedback(`About the example preview: ${feedback.trim()}`);
          setFeedback('');
        }}
      />
      <Hint>Your feedback returns to the same task as a draft.</Hint>
    </Sheet>
  );
}
