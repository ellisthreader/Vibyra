// The 16 colours a command-line tool actually paints with.
//
// xterm replaces its whole theme object on assignment, so sending only
// background/foreground/cursor leaves all 16 of these at xterm's built-in
// Tango defaults, which are drawn for a black terminal. On the light theme's
// #FBFBFC ground that put 11 of 16 below WCAG AA and five under 1.6:1 —
// brightWhite at 1.12:1, brightYellow at 1.20:1 — so plain text read and every
// coloured word disappeared. Both sets below clear 4.5:1 on their own ground.
//
// ANSI black is a background colour by definition and cannot also be readable
// text; `minimumContrastRatio` in the runtime lifts it when a tool uses it as a
// foreground. Keep these in step with `palettes` in `../theme`.
export interface AnsiPalette {
  black: string; red: string; green: string; yellow: string;
  blue: string; magenta: string; cyan: string; white: string;
  brightBlack: string; brightRed: string; brightGreen: string; brightYellow: string;
  brightBlue: string; brightMagenta: string; brightCyan: string; brightWhite: string;
}

export const ansi: { dark: AnsiPalette; light: AnsiPalette } = {
  dark: {
    black: '#454B57', red: '#F2786B', green: '#4ECB8E', yellow: '#E3B15A',
    blue: '#7B9BFF', magenta: '#D48FE0', cyan: '#5AC4D4', white: '#C6CCD8',
    // brightBlack is what every CLI uses for hints and dim detail; the default
    // #555753 sat at 2.58:1 here, which is why they vanished first.
    brightBlack: '#818997', brightRed: '#FF9384', brightGreen: '#6FE0A8', brightYellow: '#F5C978',
    brightBlue: '#9DB4FF', brightMagenta: '#E9AEF2', brightCyan: '#84DCE8', brightWhite: '#F5F7FA',
  },
  light: {
    black: '#1B1E25', red: '#B3261E', green: '#136B3F', yellow: '#8A5A00',
    blue: '#2A4FCB', magenta: '#8E2F91', cyan: '#0F6673', white: '#4A505C',
    brightBlack: '#5C6470', brightRed: '#D0342A', brightGreen: '#15804A', brightYellow: '#96670A',
    brightBlue: '#3D62E0', brightMagenta: '#A93BAB', brightCyan: '#0F7B8B', brightWhite: '#171A21',
  },
};
