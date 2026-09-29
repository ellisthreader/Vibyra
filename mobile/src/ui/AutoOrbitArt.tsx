import { memo } from "react";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  Path,
  RadialGradient,
  Stop,
} from "react-native-svg";

/** Static vector light; its parent handles rotation and breathing on the UI thread. */
export const AutoOrbitArt = memo(function AutoOrbitArt({
  color,
  size,
}: {
  color: string;
  size: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 280 280">
      <Defs>
        <RadialGradient id="auto-glow">
          <Stop offset="0" stopColor={color} stopOpacity=".22" />
          <Stop offset=".52" stopColor={color} stopOpacity=".08" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx="140" cy="140" r="137" fill="url(#auto-glow)" />
      <Ellipse
        cx="140"
        cy="140"
        rx="119"
        ry="87"
        rotation="-28"
        origin="140,140"
        stroke={color}
        strokeOpacity=".18"
        strokeWidth=".7"
        fill="none"
      />
      <Ellipse
        cx="140"
        cy="140"
        rx="113"
        ry="71"
        rotation="38"
        origin="140,140"
        stroke={color}
        strokeOpacity=".12"
        strokeWidth=".7"
        fill="none"
      />
      <Circle
        cx="140"
        cy="140"
        r="60"
        stroke={color}
        strokeOpacity=".24"
        strokeWidth=".6"
        fill="none"
      />
      <Circle
        cx="140"
        cy="140"
        r="76"
        stroke={color}
        strokeOpacity=".12"
        strokeDasharray="2 8"
        fill="none"
      />
      <Path
        d="M140 20 A120 120 0 0 1 239 72"
        stroke={color}
        strokeOpacity=".6"
        strokeWidth="1.3"
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M42 206 A118 118 0 0 0 114 256"
        stroke={color}
        strokeOpacity=".35"
        strokeWidth="1"
        strokeLinecap="round"
        fill="none"
      />
      {[
        [-96, -66],
        [94, 60],
        [24, -116],
        [-16, 115],
        [70, -80],
        [-78, 88],
      ].map(([x, y], i) => (
        <Circle
          key={i}
          cx={140 + x}
          cy={140 + y}
          r={i % 2 ? 1.4 : 2}
          fill={color}
          opacity={i % 2 ? 0.4 : 0.8}
        />
      ))}
    </Svg>
  );
});
