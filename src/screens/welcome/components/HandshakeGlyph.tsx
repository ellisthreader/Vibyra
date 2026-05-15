import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import { supportsNativeAnimation } from "../../../utils/nativeAnimation";
import { useReduceMotion } from "../hooks/useReduceMotion";
import { styles } from "../styles";

export function HandshakeGlyph({ awaiting }: { awaiting: boolean }) {
  const reduced = useReduceMotion();
  const beam = useRef(new Animated.Value(0)).current;
  const shieldScale = useRef(new Animated.Value(awaiting ? 1 : 0.6)).current;
  const shieldOpacity = useRef(new Animated.Value(awaiting ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) {
      beam.setValue(0.6);
      return;
    }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(beam, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.cubic), useNativeDriver: supportsNativeAnimation }),
      Animated.timing(beam, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.cubic), useNativeDriver: supportsNativeAnimation })
    ]));
    loop.start();
    return () => loop.stop();
  }, [beam, reduced]);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(shieldScale, { toValue: awaiting ? 1 : 0.6, useNativeDriver: supportsNativeAnimation, speed: 12, bounciness: 8 }),
      Animated.timing(shieldOpacity, { toValue: awaiting ? 1 : 0, duration: 240, useNativeDriver: supportsNativeAnimation })
    ]).start();
  }, [awaiting, shieldOpacity, shieldScale]);

  const beamOpacity = beam.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });

  return (
    <View>
      <Animated.View style={[styles.shieldFloat, { opacity: shieldOpacity, transform: [{ scale: shieldScale }] }]}>
        <Ionicons color="#37D67A" name="shield-checkmark" size={28} />
      </Animated.View>
      <View accessible={false} style={styles.handshakeWrap}>
        <View style={styles.glyph}>
          <Ionicons color="#D8BCFF" name="phone-portrait-outline" size={36} />
        </View>
        <Animated.View style={[styles.glyphBeam, { opacity: beamOpacity }]} />
        <View style={styles.glyph}>
          <Ionicons color="#D8BCFF" name="desktop-outline" size={36} />
        </View>
      </View>
    </View>
  );
}
