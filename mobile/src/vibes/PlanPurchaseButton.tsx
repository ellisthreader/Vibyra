import { useLayoutEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { Button } from '../ui/primitives';

/** The current price stays readable while acknowledging the newly selected size. */
export function PlanPurchaseButton({
  title,
  still,
  busy,
  disabled,
  onPress,
}: {
  title: string;
  still: boolean;
  busy: boolean;
  disabled: boolean;
  onPress(): void;
}) {
  const previous = useRef(title);
  const progress = useRef(new Animated.Value(1)).current;
  useLayoutEffect(() => {
    const changed = previous.current !== title;
    previous.current = title;
    progress.stopAnimation();
    if (still || !changed) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
      isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [title, still, progress]);
  return (
    <Animated.View
      style={{ opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }}
    >
      <Button title={title} busy={busy} disabled={disabled} onPress={onPress} />
    </Animated.View>
  );
}
