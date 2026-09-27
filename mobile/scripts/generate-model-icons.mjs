import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { decardGemini } from './decard-gemini.mjs';
import { geminiIcon, openAiIcon } from './model-icon-art.mjs';

// Draws the model tiles that are missing from the shared artwork set, in the
// visual system the existing ones already use. Rendered locally by headless
// Chrome — the same browser the verification scripts drive — so this needs no
// API key and no network. Re-running it reproduces the same files exactly.
const out = process.env.ICON_OUT ?? 'assets/model-icons';
await mkdir(out, { recursive: true });

const icons = [
  // Gemini: the four-pointed star on white, one gradient per model, the version
  // large and the tier in letterspaced caps beneath it.
  // Every existing star runs warm or light at its top-left tip to cool at the
  // bottom-right, so these do too; the accent after it is the colour the version
  // number takes, drawn from the star it sits under.
  ['gemini-3.8-pro', geminiIcon('3.8', 'PRO', ['#FF6B4A', '#B96BE8', '#2F52E0'], '#7A4FE0')],
  ['gemini-3.8-flash', geminiIcon('3.8', 'FLASH', ['#FFE04A', '#3FD6C8', '#2F7DF0'], '#0E9BD8')],
  ['gemini-3.7-flash', geminiIcon('3.7', 'FLASH', ['#FFB03D', '#5AC97A', '#3A7BE8'], '#2E9E63')],
  ['gemini-3.6-flash', geminiIcon('3.6', 'FLASH', ['#FF8A5A', '#8C8CFF', '#3A5BE8'], '#5560E0')],
  ['gemini-3.5-flash-lite', geminiIcon('3.5', 'FLASH LITE', ['#FFCBB0', '#A9DCC8', '#AEC8F7'], '#78B39F')],
  // Astra completes OpenAI's Sol / Terra / Luna family: the stars themselves.
  ['gpt-6-astra', openAiIcon('6', 'ASTRA')],
];

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 128, height: 128 }, deviceScaleFactor: 1 });
  for (const [name, html] of icons) {
    await page.setContent(html);
    await page.waitForTimeout(60);
    await writeFile(`${out}/${name}.png`, await page.screenshot({ omitBackground: true }));
    console.log(`wrote ${out}/${name}.png`);
  }
  // The tiles inherited from desktop still carry a white card; lift it so the
  // whole Gemini family sits on the theme rather than in a bright block.
  const lifted = await decardGemini(page, out);
  if (lifted.length) console.log(`lifted the white card from ${lifted.length}: ${lifted.join(', ')}`);
} finally { await browser.close(); }
