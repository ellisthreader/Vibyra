import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { useHandoffTarget } from './ComputerHandoff';
import { FoundMachine } from './FoundMachine';

import { ApprovalDisplay, type ConnectionStage } from './ApprovalDisplay';
export type { ConnectionStage } from './ApprovalDisplay';

/** Same shell as discovery. Only its screen changes; approval always happens on
 * the real computer. This miniature is decorative, never a phone permission UI. */
export function ApprovalComputer({ stage, width }: { stage: ConnectionStage; width: number }) {
  const frame = useRef<View>(null);
  const handoff = useHandoffTarget();
  const motion = useRef({ rise: new Animated.Value(1), lid: new Animated.Value(1), settle: new Animated.Value(1) }).current;
  const measure = () => frame.current?.measureInWindow((x, y, w, h) => {
    if (w > 0) handoff?.report({ x, y, width: w, height: h }, stage);
  });
  useEffect(measure, [stage]);
  return <View testID="approval-computer" ref={frame} collapsable={false} onLayout={measure}
    pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden
    style={{ width, height: width * 0.84 }}>
    <Animated.View style={{ opacity: handoff ? 0 : 1 }}>
      <FoundMachine width={width} motion={motion} screen={<ApprovalDisplay key={stage} stage={stage} scale={width / 252} />} />
    </Animated.View>
  </View>;
}

