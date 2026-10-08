import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { qrSymbol } from './qr';

/**
 * A scannable code, drawn as one path of squares on a white card. White is not a
 * theme colour here on purpose: a scanner needs the dark-on-light contrast the
 * symbol was designed for, and a code inverted to suit a dark page is a code that
 * some phones refuse to read. The quiet zone is the card's own padding.
 */
export function QrCode({
  value,
  size = 216,
  label,
}: {
  value: string;
  size?: number;
  label?: string;
}) {
  const path = useMemo(() => {
    const { side, dark } = qrSymbol(value);
    const parts: string[] = [];
    for (let row = 0; row < side; row += 1) {
      // Runs of dark modules become one rectangle, so a symbol is tens of shapes, not hundreds.
      for (let col = 0; col < side; col += 1) {
        if (!dark[row][col]) continue;
        let run = 1;
        while (col + run < side && dark[row][col + run]) run += 1;
        parts.push(`M${col} ${row}h${run}v1h-${run}z`);
        col += run - 1;
      }
    }
    return { d: parts.join(''), side };
  }, [value]);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label ?? 'Setup code'}
      style={[s.card, { width: size, height: size }]}
    >
      <Svg width="100%" height="100%" viewBox={`-2 -2 ${path.side + 4} ${path.side + 4}`}>
        <Rect x={-2} y={-2} width={path.side + 4} height={path.side + 4} fill="#FFFFFF" />
        <Path d={path.d} fill="#000000" />
      </Svg>
    </View>
  );
}
const s = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 10, alignSelf: 'center' },
});
