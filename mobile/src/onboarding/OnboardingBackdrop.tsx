import { Animated, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import { useDrift } from './welcomeMotion';

const cobalt = require('../../assets/glow-cobalt.png');
const violet = require('../../assets/glow-violet.png');
const sky = require('../../assets/glow-sky.png');
// Four blue-family glows drifting on different cycles with a gentle brightness pulse. `centre` is the y the
// main glow is anchored to; `soft` dims everything for screens with forms and reading.
export function OnboardingBackdrop({ centre, soft = false }: { centre: number; soft?: boolean }) {
  const { dark } = useTheme();
  const k = (soft ? 0.6 : 1) * (dark ? 1 : 0.5);
  const halo = useDrift({ period: 9000, dx: 34, dy: -22, grow: 1.16, opacity: 0.95 * k });
  const bloom = useDrift({ period: 12500, dx: 58, dy: 44, grow: 1.22, opacity: 0.7 * k });
  const wash = useDrift({ period: 10500, dx: -52, dy: -38, grow: 1.2, opacity: 0.55 * k });
  const ember = useDrift({ period: 14000, dx: -44, dy: 34, grow: 1.18, opacity: 0.5 * k });
  return <>
    <Animated.Image source={violet} style={[s.bloom, { top: centre - 250 }, bloom]} />
    <Animated.Image source={sky} style={[s.wash, { top: centre - 60 }, wash]} />
    <Animated.Image source={cobalt} style={[s.ember, { top: centre + 140 }, ember]} />
    <Animated.Image source={cobalt} style={[s.halo, { top: centre - 310 }, halo]} />
  </>;
}
const s = StyleSheet.create({
  halo: { position: 'absolute', width: 620, height: 620 },
  bloom: { position: 'absolute', left: -230, width: 460, height: 460 },
  wash: { position: 'absolute', right: -210, width: 420, height: 420 },
  ember: { position: 'absolute', left: -180, width: 400, height: 400 },
});
