import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { palettes, useTheme } from '../theme';

/**
 * The Vibyra token: a cobalt disc with the Vibyra V struck into it in white.
 *
 * The disc is the part that was always right. A token is a round thing you hold a
 * number of, and beside a 44pt balance figure a solid disc is the only silhouette
 * that stays confident at 34pt; every alternative tried against it — a rounded
 * chip, a bare V, a V crossed with currency bars — either lost that legibility or
 * said the wrong thing. The chip read as an app icon that had wandered onto the
 * page. The bare V is the *company's* mark, so where a unit belongs it says
 * "Vibyra" rather than "Vibes".
 *
 * What was wrong was the device inside it: a four-pointed spark, which is the most
 * over-used glyph in software right now and the same one Gemini, Copilot and every
 * "AI" button in the industry draws. As the mark of *this* product's currency it
 * said nothing, and it was reported as looking like a stock icon off a search
 * result. The brand V says the one thing a currency mark has to say — whose it is —
 * and it costs no legibility, because it is struck out of the same two shapes.
 *
 * **Two shapes and one colour. Keep it that way.** The earlier coin — a white
 * gradient inside the disc for lift, a hairline "milled edge" ring — was cut on
 * report as fussy, and it stays cut: at 34pt the ring is a grey smudge and the
 * gradient is invisible. There is no glow; Graphite and Cobalt does not allow one.
 * The disc is the theme's *Cobalt*, not the accent a person picks in Settings: the
 * currency is the brand's, and the white V vanishes on Graphite's near-white disc
 * (1.2:1) and fades on Sky, Teal and Ember (about 2:1).
 */
export function TokenMark({ size = 34 }: { size?: number }) {
  const { dark } = useTheme();
  // The hiding props sit on a View: handed to <Svg>, the browser gets them as unknown
  // attributes on its <svg> and React logs an error on every page that shows a balance.
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden
    style={{ width: size, height: size }}>
  <Svg width={size} height={size} viewBox="0 0 64 64">
    <Circle cx="32" cy="32" r="31" fill={palettes[dark ? 'dark' : 'light'].accent} />
    {/* The V is placed by the **area centroid of the white mass**, not by its
        bounding box. A V is top-heavy — most of its area is in the two arms — so
        box-centring rode it up the coin's top-left, which is how it first drew.
        Centroid at (32,32), and the nearest white edge sits 4.75 units inside the
        r31 rim: at 4 the arm tips crowd the edge and the mark reads as a V pressed
        against a circle rather than struck into one; at 5.5 the face is visibly
        under-filled. Coordinates are 3dp because six is noise in a 64-unit box.
        Change the size and all three have to be re-measured at 34pt. */}
    <Path fill="#FFFFFF" d="M12.199 17.883 L19.532 17.883 A2.032 2.032 0 0 1 21.292 18.899 L33.025 39.221 L38.891 29.060 A2.032 2.032 0 0 1 40.651 28.044 L47.984 28.044 A0.508 0.508 0 0 1 48.424 28.806 L40.064 43.285 A8.129 8.129 0 0 1 25.985 43.285 L11.759 18.645 A0.508 0.508 0 0 1 12.199 17.883 Z" />
    {/* The brand's detached upper-right blade, 4.065 units clear of the body. It is
        the first detail to soften at 34pt and it was tested against its own absence:
        without it the right arm still ends on the brand's short diagonal cut, and
        with nothing above that cut it reads as a V someone forgot to finish. It is
        load-bearing, not decoration — the mark is more legible without it and less
        Vibyra's. */}
    <Path fill="#FFFFFF" d="M46.518 17.883 L53.850 17.883 A0.508 0.508 0 0 1 54.290 18.645 L51.797 22.963 A2.032 2.032 0 0 1 50.037 23.979 L42.704 23.979 A0.508 0.508 0 0 1 42.264 23.217 L44.758 18.899 A2.032 2.032 0 0 1 46.518 17.883 Z" />
  </Svg></View>;
}
