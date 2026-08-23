import React from "react";
import Svg, { Circle, Line } from "react-native-svg";

export function ClaudeLogo({ compact }: { compact?: boolean }) {
  const size = compact ? 16 : 24;
  const strokeWidth = compact ? 9 : 10.5;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Line x1="50" y1="50" x2="31" y2="10" stroke="#D97757" strokeLinecap="round" strokeWidth={strokeWidth} />
      <Line x1="50" y1="50" x2="57" y2="12" stroke="#D97757" strokeLinecap="round" strokeWidth={strokeWidth} />
      <Line x1="50" y1="50" x2="77" y2="21" stroke="#D97757" strokeLinecap="round" strokeWidth={strokeWidth} />
      <Line x1="50" y1="50" x2="90" y2="43" stroke="#D97757" strokeLinecap="round" strokeWidth={strokeWidth} />
      <Line x1="50" y1="50" x2="87" y2="60" stroke="#D97757" strokeLinecap="round" strokeWidth={strokeWidth} />
      <Line x1="50" y1="50" x2="73" y2="80" stroke="#D97757" strokeLinecap="round" strokeWidth={strokeWidth} />
      <Line x1="50" y1="50" x2="48" y2="91" stroke="#D97757" strokeLinecap="round" strokeWidth={strokeWidth} />
      <Line x1="50" y1="50" x2="31" y2="84" stroke="#D97757" strokeLinecap="round" strokeWidth={strokeWidth} />
      <Line x1="50" y1="50" x2="15" y2="70" stroke="#D97757" strokeLinecap="round" strokeWidth={strokeWidth} />
      <Line x1="50" y1="50" x2="8" y2="47" stroke="#D97757" strokeLinecap="round" strokeWidth={strokeWidth} />
      <Line x1="50" y1="50" x2="15" y2="28" stroke="#D97757" strokeLinecap="round" strokeWidth={strokeWidth} />
      <Circle cx="50" cy="50" fill="#D97757" r="14" />
    </Svg>
  );
}
