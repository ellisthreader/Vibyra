import { readFileSync } from 'node:fs';
import { TerminalScreen } from './src/terminal/screen';
const screen = new TerminalScreen(90, 30);
screen.write(readFileSync(process.argv[2], 'utf8'));
for (const line of screen.lines()) console.log('|' + line.map(s => s.text).join(''));
