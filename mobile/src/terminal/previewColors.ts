import { ansi, type AnsiPalette } from './ansi';

const order: (keyof AnsiPalette)[] = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'];
const channel = (value: number) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
const luminance = (hex: string) => [1, 3, 5].map(at => channel(parseInt(hex.slice(at, at + 2), 16) / 255))
  .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0);
const contrast = (a: string, b: string) => {
  const [one, two] = [luminance(a), luminance(b)];
  return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
};

/**
 * The colour a preview draws a span in. Named colours come from the same
 * palette as the open terminal; a tool's own truecolour is kept unless it
 * would vanish on this ground, where the open terminal's contrast floor would
 * have lifted it too.
 */
export function previewColor(color: number | string | undefined, dark: boolean, ground: string, text: string) {
  const value = typeof color === 'number' ? ansi[dark ? 'dark' : 'light'][order[color]!] : color;
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) return text;
  return contrast(value, ground) >= 3 ? value : text;
}
