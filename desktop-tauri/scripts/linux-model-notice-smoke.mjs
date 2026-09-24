import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { verifyReport } from "./linux-terminal-ux.mjs";

export async function verifyLinuxOnboardingAndReport(driver, output, reports) {
  await driver.execute(`document.querySelector('.first-welcome__skip')?.click()`);
  await driver.until(() => driver.execute(`return !document.querySelector('.first-welcome')`), "first welcome dismissed");
  await driver.until(() => driver.execute(`const notice = document.querySelector('.new-models');
    const rect = notice?.getBoundingClientRect();
    return Boolean(notice && rect.width > 0 && rect.height > 0
      && notice.textContent.includes('GPT-6 Series')
      && notice.textContent.includes('Claude Opus 5.5')
      && notice.querySelector('.new-models__start'));`), "visible Linux new-models notice and launch action");
  writeFileSync(join(output, "new-models-notice.png"), await driver.screenshot());
  await driver.click(".new-models__later");
  await driver.dismissWorkspaceOverlays();
  await verifyReport(driver, reports);
  await driver.dismissWorkspaceOverlays();
}
