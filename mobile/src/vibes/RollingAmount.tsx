import { useLayoutEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';

/** Show only the old and new allowance; never spin through invented values. */
export function RollingAmount({
  value,
  still,
  style,
  height,
}: {
  value: number;
  still: boolean;
  style: StyleProp<TextStyle>;
  height: number;
}) {
  const [change, setChange] = useState({ from: value, to: value });
  const [settled, setSettled] = useState(true);
  const progress = useRef(new Animated.Value(1)).current;
  if (value !== change.to) setChange({ from: change.to, to: value });
  useLayoutEffect(() => {
    progress.stopAnimation();
    if (still || change.from === change.to) {
      progress.setValue(1);
      setSettled(true);
      return;
    }
    setSettled(false);
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
      isInteraction: false,
    });
    animation.start(({ finished }) => {
      if (finished) setSettled(true);
    });
    return () => animation.stop();
  }, [change, still, progress]);
  const direction = change.to > change.from ? 1 : -1;
  const textStyle = [style, s.digits];
  return (
    <View
      testID="plan-amount"
      style={{ height }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {!settled && !still && (
        <Animated.Text
          style={[
            textStyle,
            s.previous,
            {
              opacity: progress.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 0, 0] }),
              transform: [
                {
                  translateY: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -6 * direction],
                  }),
                },
              ],
            },
          ]}
        >
          {change.from.toLocaleString()}
        </Animated.Text>
      )}
      <Animated.Text
        style={[
          textStyle,
          {
            opacity: progress,
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [6 * direction, 0],
                }),
              },
            ],
          },
        ]}
      >
        {value.toLocaleString()}
      </Animated.Text>
    </View>
  );
}
const s = StyleSheet.create({
  previous: { position: 'absolute', left: 0, top: 0 },
  digits: { fontVariant: ['tabular-nums'] },
});
