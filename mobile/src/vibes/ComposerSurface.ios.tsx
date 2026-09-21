import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View, type ViewProps } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type { GlassView as NativeGlassView } from 'expo-glass-effect';
import { useGlass } from './glass';
import { useTheme } from '../theme';

// Older installed dev clients may not contain the newly linked module yet.
// Do not load its native view manager until availability has been established.
let GlassView: typeof NativeGlassView | undefined;
if (requireOptionalNativeModule('ExpoGlassEffect')?.isLiquidGlassAvailable) {
  const effect: typeof import('expo-glass-effect') = require('expo-glass-effect');
  if (effect.isGlassEffectAPIAvailable()) GlassView = effect.GlassView;
}

/** One native material behind the controls; never stack glass on each row. */
export function ComposerSurface({ children, style, matte = false, ...props }: ViewProps & { matte?: boolean }) {
  const glass = useGlass(); const { dark } = useTheme();
  const [opaque, setOpaque] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceTransparencyEnabled().then(value => { if (active) setOpaque(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setOpaque);
    return () => { active = false; subscription.remove(); };
  }, []);
  const native = GlassView && !opaque && !matte;
  return <View {...props} style={[!matte && glass.sheet, style, native && { backgroundColor: 'transparent' }]}>
    {native && GlassView && <GlassView pointerEvents="none" glassEffectStyle="regular" colorScheme={dark ? 'dark' : 'light'}
      style={[StyleSheet.absoluteFill, { borderRadius: 28 }]} />}
    {children}
  </View>;
}
