import { useMemo } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { ModelLogo } from "./BrandLogo";
import { useTheme } from "../theme";
import { useAppear } from "./motion";
import type { useAutoSceneMotion } from "./useAutoSceneMotion";

type Motion = ReturnType<typeof useAutoSceneMotion>;
export function AutoOrbitTile({
  id,
  index,
  count,
  size,
  motion,
}: {
  id: string;
  index: number;
  count: number;
  size: number;
  motion: Motion;
}) {
  const { colors } = useTheme();
  const appear = useAppear(motion.still, index * 65);
  const { orbit, resolve } = motion;
  const position = useMemo(() => {
    const inputRange = Array.from({ length: 33 }, (_, i) => i / 32);
    const angles = inputRange.map(
      (t) => t * Math.PI * 2 + (index / count) * Math.PI * 2 - Math.PI / 2,
    );
    const open = Animated.subtract(1, resolve);
    return {
      x: Animated.multiply(
        orbit.interpolate({
          inputRange,
          outputRange: angles.map((a) => Math.cos(a) * size * 0.37),
        }),
        open,
      ),
      y: Animated.multiply(
        orbit.interpolate({
          inputRange,
          outputRange: angles.map((a) => Math.sin(a) * size * 0.32),
        }),
        open,
      ),
      depth: orbit.interpolate({
        inputRange,
        outputRange: angles.map((a) => 0.85 + Math.sin(a) * 0.12),
      }),
      opacity: open,
    };
  }, [orbit, resolve, index, count, size]);
  const tile = Math.max(24, Math.min(42, size * 0.16));
  return (
    <Animated.View
      testID="auto-orbit-tile"
      style={[
        s.tile,
        {
          width: tile + 8,
          height: tile + 8,
          left: (size - tile - 8) / 2,
          top: (size - tile - 8) / 2,
          opacity: Animated.multiply(appear, position.opacity),
          transform: [
            { translateX: position.x },
            { translateY: position.y },
            { scale: Animated.multiply(appear, position.depth) },
          ],
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <View testID={`auto-candidate-${id}`}>
        <ModelLogo id={id} size={tile} />
      </View>
    </Animated.View>
  );
}
const s = StyleSheet.create({
  tile: {
    position: "absolute",
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
});
