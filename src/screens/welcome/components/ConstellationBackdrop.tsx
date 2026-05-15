import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Image, View } from "react-native";
import { supportsNativeAnimation } from "../../../utils/nativeAnimation";
import { connectBackdrop } from "../../onboarding/data/options";
import { useReduceMotion } from "../hooks/useReduceMotion";
import { styles } from "../styles";

const PARTICLE_COUNT = 8;

export function ConstellationBackdrop({ withParticles = false }: { withParticles?: boolean }) {
  const reduced = useReduceMotion();
  const enable = withParticles && !reduced;

  return (
    <View style={styles.shell} pointerEvents="none">
      <Image fadeDuration={0} resizeMode="cover" source={connectBackdrop} style={styles.backdropImage} />
      <LinearGradient
        colors={["rgba(4, 5, 12, 0.18)", "rgba(4, 5, 12, 0.42)", "rgba(4, 5, 12, 0.2)"]}
        locations={[0, 0.55, 1]}
        style={styles.backdropShade}
      />
      {enable ? <Particles /> : null}
    </View>
  );
}

function Particles() {
  const seeds = useMemo(() => buildSeeds(), []);
  return (
    <View style={styles.backdropShade} pointerEvents="none">
      {seeds.map((seed, index) => <Particle key={index} seed={seed} />)}
    </View>
  );
}

function Particle({ seed }: { seed: ParticleSeed }) {
  const driver = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(driver, { toValue: 1, duration: seed.duration, easing: Easing.inOut(Easing.sin), useNativeDriver: supportsNativeAnimation }),
      Animated.timing(driver, { toValue: 0, duration: seed.duration, easing: Easing.inOut(Easing.sin), useNativeDriver: supportsNativeAnimation })
    ]));
    loop.start();
    return () => loop.stop();
  }, [driver, seed.duration]);

  const translateX = driver.interpolate({ inputRange: [0, 1], outputRange: [seed.x - seed.drift, seed.x + seed.drift] });
  const translateY = driver.interpolate({ inputRange: [0, 1], outputRange: [seed.y, seed.y - seed.drift] });
  const opacity = driver.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.95] });

  return <Animated.View pointerEvents="none" style={[styles.particle, { opacity, transform: [{ translateX }, { translateY }] }]} />;
}

type ParticleSeed = { x: number; y: number; drift: number; duration: number };

function buildSeeds(): ParticleSeed[] {
  const seeds: ParticleSeed[] = [];
  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    seeds.push({
      x: 30 + ((i * 73) % 280),
      y: 80 + ((i * 137) % 480),
      drift: 24 + ((i * 17) % 28),
      duration: 3200 + ((i * 281) % 2200)
    });
  }
  return seeds;
}
