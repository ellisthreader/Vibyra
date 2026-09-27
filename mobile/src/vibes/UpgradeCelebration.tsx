import { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useAppear } from '../ui/motion';
import { Button } from '../ui/primitives';
import { planNames } from './plans';

export interface UpgradeSuccess {
  plan: string;
  added: number;
  balance: number;
  preview?: boolean;
}
/** One finite celebration, driven natively and omitted entirely for Reduce Motion. */
export function UpgradeCelebration({
  result,
  still,
  onDone,
}: {
  result: UpgradeSuccess;
  still: boolean;
  onDone(): void;
}) {
  const { colors } = useTheme();
  const appear = useAppear(still);
  return (
    <Modal visible transparent animationType="none" onRequestClose={onDone}>
      <SafeAreaView style={[s.page, { backgroundColor: colors.background }]}>
        <Animated.View
          style={[
            s.card,
            {
              opacity: appear,
              transform: [
                { scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
              ],
            },
          ]}
        >
          <Animated.Image
            source={require('../../assets/vibyra-pro.png')}
            accessible={false}
            resizeMode="contain"
            style={s.art}
          />
          <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>
            {result.preview ? 'Preview: you’re Pro!' : 'You’re Pro!'}
          </Text>
          <Text style={[s.lead, { color: colors.muted }]}>
            {planNames[result.plan] ?? 'Vibyra Pro'} · All your Pro features unlocked
          </Text>
          <Text testID="upgrade-added" style={[s.amount, { color: colors.accent }]}>
            +{result.added.toLocaleString()} Vibes
          </Text>
          <Text style={[s.lead, { color: colors.muted }]}>
            {result.balance.toLocaleString()} Vibes ready to use
          </Text>
          {result.preview && (
            <Text style={[s.preview, { color: colors.muted }]}>
              Test preview only. Your account, balance and billing are unchanged.
            </Text>
          )}
        </Animated.View>
        <View style={s.footer}>
          <Button title={result.preview ? 'Finish preview' : 'Let’s build'} onPress={onDone} />
        </View>
        {!still && <Confetti />}
      </SafeAreaView>
    </Modal>
  );
}
function Confetti() {
  const { width, height } = useWindowDimensions();
  const fall = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.timing(fall, {
      toValue: 1,
      duration: 3200,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [fall]);
  return (
    <View
      testID="upgrade-confetti"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      {Array.from({ length: 48 }, (_, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: (((i * 37) % 101) / 100) * width,
            top: -30 - (i % 8) * 44,
            width: 7,
            height: i % 3 ? 12 : 7,
            borderRadius: i % 3 ? 2 : 4,
            backgroundColor: ['#4667E8', '#4FB3F6', '#E8A94B', '#37C78A'][i % 4],
            opacity: fall.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
            transform: [
              {
                translateY: fall.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, height + 430],
                }),
              },
              {
                translateX: fall.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, (i % 2 ? 1 : -1) * (20 + i)],
                }),
              },
              {
                rotate: fall.interpolate({
                  inputRange: [0, 1],
                  outputRange: [`${i * 17}deg`, `${i * 17 + 540}deg`],
                }),
              },
            ],
          }}
        />
      ))}
    </View>
  );
}
const s = StyleSheet.create({
  page: { flex: 1 },
  card: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28, gap: 14 },
  art: { width: 150, height: 178 },
  title: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
    letterSpacing: -1.1,
    textAlign: 'center',
  },
  lead: { fontSize: 16, lineHeight: 23, letterSpacing: -0.2, textAlign: 'center' },
  amount: {
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -1,
    marginTop: 18,
    fontVariant: ['tabular-nums'],
  },
  preview: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 12 },
  footer: { paddingHorizontal: 20, paddingVertical: 20 },
});
