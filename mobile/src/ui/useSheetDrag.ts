import { useRef } from 'react';
import { Animated, PanResponder } from 'react-native';

const settle = { damping: 22, stiffness: 240, mass: 1 };

/**
 * Pull-down-to-dismiss for a sheet's grabber and header. `drag` is the finger's
 * offset in points, added to the sheet's own open/close translation, so a release
 * past the line closes from wherever the sheet was left rather than jumping back
 * first. Down follows the finger; up is resisted at a fifth, because the sheet is
 * already as tall as it gets. The responder only claims a vertical move of a few
 * points, so the Back and close buttons in the same strip still take a plain tap.
 */
export function useSheetDrag({ height, onDismiss, native }: {
  height: number; onDismiss: () => void; native: boolean;
}) {
  const drag = useRef(new Animated.Value(0)).current;
  // Read through a ref: the responder is made once, and a stale height or callback
  // would dismiss against the wrong line or close a sheet that has moved on.
  const latest = useRef({ height, onDismiss, native });
  latest.current = { height, onDismiss, native };
  const back = () => Animated.spring(drag, { toValue: 0, ...settle, useNativeDriver: latest.current.native }).start();
  const responder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderMove: (_event, gesture) => drag.setValue(gesture.dy < 0 ? gesture.dy * 0.2 : gesture.dy),
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dy > latest.current.height * 0.25 || gesture.vy > 0.9) latest.current.onDismiss();
      else back();
    },
    onPanResponderTerminate: () => back(),
  })).current;
  return { drag, panHandlers: responder.panHandlers };
}
