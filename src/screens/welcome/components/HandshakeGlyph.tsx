import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import { supportsNativeAnimation } from "../../../utils/nativeAnimation";
import { useReduceMotion } from "../hooks/useReduceMotion";
import { styles } from "../styles";

export function HandshakeGlyph({ awaiting }: { awaiting: boolean }) {
  const reduced = useReduceMotion();
  const beam = useRef(new Animated.Value(0)).current;
  const iconPulse = useRef(new Animated.Value(0)).current;
  const shieldScale = useRef(new Animated.Value(awaiting ? 1 : 0.6)).current;
  const shieldOpacity = useRef(new Animated.Value(awaiting ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) {
      beam.setValue(0.6);
      iconPulse.setValue(1);
      return;
    }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(beam, { toValue: 1, duration: 1050, easing: Easing.inOut(Easing.cubic), useNativeDriver: supportsNativeAnimation }),
      Animated.timing(beam, { toValue: 0, duration: 1050, easing: Easing.inOut(Easing.cubic), useNativeDriver: supportsNativeAnimation })
    ]));
    const iconLoop = Animated.loop(Animated.sequence([
      Animated.timing(iconPulse, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.cubic), useNativeDriver: supportsNativeAnimation }),
      Animated.timing(iconPulse, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.cubic), useNativeDriver: supportsNativeAnimation })
    ]));
    loop.start();
    iconLoop.start();
    return () => {
      loop.stop();
      iconLoop.stop();
    };
  }, [beam, iconPulse, reduced]);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(shieldScale, { toValue: awaiting ? 1 : 0.6, useNativeDriver: supportsNativeAnimation, speed: 12, bounciness: 8 }),
      Animated.timing(shieldOpacity, { toValue: awaiting ? 1 : 0, duration: 240, useNativeDriver: supportsNativeAnimation })
    ]).start();
  }, [awaiting, shieldOpacity, shieldScale]);

  const beamOpacity = beam.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });
  const beamScale = beam.interpolate({ inputRange: [0, 1], outputRange: [0.68, 1] });
  const iconScale = iconPulse.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1.04] });

  return (
    <View style={styles.approvalVisual}>
      <Animated.View style={[styles.shieldFloat, { opacity: shieldOpacity, transform: [{ scale: shieldScale }] }]}>
        <Ionicons color="#37D67A" name="shield-checkmark" size={34} />
      </Animated.View>
      <View accessible={false} style={styles.handshakeWrap}>
        <Animated.View style={[styles.glyph, { transform: [{ scale: iconScale }] }]}>
          <Ionicons color="#E8DBFF" name="phone-portrait-outline" size={58} />
        </Animated.View>
        <Animated.View style={[styles.glyphBeam, { opacity: beamOpacity, transform: [{ scaleX: beamScale }] }]} />
        <Animated.View style={[styles.glyph, { transform: [{ scale: iconScale }] }]}>
          <Ionicons color="#E8DBFF" name="desktop-outline" size={58} />
        </Animated.View>
      </View>
    </View>
  );
}
