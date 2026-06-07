import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, PanResponder, Pressable, View, useWindowDimensions } from "react-native";
import { styles } from "../styles";

export function SidePanel({ children, onClose, side, visible }: {
  children: React.ReactNode;
  onClose: () => void;
  side: "left" | "right";
  visible: boolean;
}) {
  const { width } = useWindowDimensions();
  const widthRef = useRef(width);
  widthRef.current = width;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [rendered, setRendered] = useState(visible);
  const anim = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (visible) {
      setRendered(true);
      Animated.timing(anim, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    } else if (rendered) {
      Animated.timing(anim, { toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: false }).start(({ finished }) => {
        if (finished) setRendered(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => {
      const horizontal = Math.abs(g.dx) > Math.abs(g.dy) * 1.4 && Math.abs(g.dx) > 8;
      if (!horizontal) return false;
      return side === "left" ? g.dx < 0 : g.dx > 0;
    },
    onPanResponderMove: (_e, g) => {
      const raw = side === "left" ? 1 + g.dx / widthRef.current : 1 - g.dx / widthRef.current;
      anim.setValue(Math.max(0, Math.min(1, raw)));
    },
    onPanResponderRelease: (_e, g) => {
      const w = widthRef.current;
      const shouldClose = side === "left" ? (g.dx < -w * 0.3 || g.vx < -0.35) : (g.dx > w * 0.3 || g.vx > 0.35);
      if (shouldClose) {
        Animated.timing(anim, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: false }).start(({ finished }) => {
          if (finished) { setRendered(false); onCloseRef.current(); }
        });
      } else {
        Animated.timing(anim, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
      }
    }
  })).current;

  if (!rendered) return null;

  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: side === "left" ? [-width, 0] : [width, 0] });

  return (
    <Modal animationType="none" onRequestClose={onClose} transparent visible>
      <View style={styles.sidePanelRoot}>
        <Animated.View style={[styles.sidePanelScrim, { opacity: anim }]}>
          <Pressable accessibilityLabel="Close" style={styles.sidePanelScrimFill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          {...panResponder.panHandlers}
          style={[styles.sidePanelSheet, side === "right" ? styles.sidePanelSheetRight : styles.sidePanelSheetLeft, { transform: [{ translateX }] }]}
        >
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}
