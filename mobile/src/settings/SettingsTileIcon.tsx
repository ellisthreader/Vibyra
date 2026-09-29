import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type SettingsTileName = 'general' | 'accounts' | 'notifications' | 'computer' |
  'account' | 'advanced' | 'help';
export const tileColors: Record<SettingsTileName, string> = {
  general: '#6b7280', accounts: '#5b7cfa', notifications: '#e0553f', computer: '#2f9e6b',
  account: '#2a8bd6', advanced: '#3f4756', help: '#8b5cf6',
};

/** The same 24-unit, round-stroke glyphs as Mac Settings, on its coloured tiles. */
export function SettingsTileIcon({ name }: { name: SettingsTileName }) {
  return <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#fff"
    strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {name === 'general' && <>
      <Circle cx={12} cy={12} r={3} />
      <Path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h.01a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
    </>}
    {name === 'accounts' && <>
      <Path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3zM19 3v4M21 5h-4" />
    </>}
    {name === 'notifications' && <>
      <Path d="M18 9a6 6 0 1 0-12 0c0 4.6-1.8 5.8-2.3 6.2a.6.6 0 0 0 .4 1.1h15.8a.6.6 0 0 0 .4-1.1C19.8 14.8 18 13.6 18 9zM13.8 19.4a2 2 0 0 1-3.6 0" />
    </>}
    {name === 'computer' && <>
      <Rect x={2.5} y={4} width={19} height={13} rx={2} />
      <Path d="M9 20.5h6M12 17v3.5" />
    </>}
    {name === 'account' && <>
      <Circle cx={12} cy={8} r={4} /><Path d="M4 20c0-3.3 3.6-5 8-5s8 1.7 8 5" />
    </>}
    {name === 'advanced' && <>
      <Path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
    </>}
    {name === 'help' && <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M9.8 9.3a2.3 2.3 0 0 1 4.5.7c0 1.5-2.3 2-2.3 3.5M12 17h.01" />
    </>}
  </Svg>;
}
