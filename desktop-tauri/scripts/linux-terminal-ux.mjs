export function receiveReport(request, send, reports) {
  const chunks = [];
  request.on("data", chunk => chunks.push(chunk));
  request.on("end", () => {
    const body = Buffer.concat(chunks).toString();
    if (request.headers.authorization !== "Bearer terminal-smoke-local-token"
      || !body.includes("Linux smoke report") || !body.includes("The report path should reach the server")) {
      send(422, { ok: false, error: "Report contract mismatch" });
      return;
    }
    reports.push(body);
    send(200, { ok: true, id: "VR-LINUX" });
  });
}

export async function verifyReport(driver, reports) {
  await driver.until(() => driver.execute(`return Boolean(document.querySelector('button[aria-label="Report a bug"]'))`),
    "visible Report a bug action");
  await driver.click('button[aria-label="Report a bug"]');
  await driver.until(() => driver.execute(`return Boolean(document.querySelector('.report-modal[role="dialog"]'))`),
    "Report a problem dialog");
  await driver.keys('.report__primary input', 'Linux smoke report');
  await driver.keys('.report__primary textarea', 'The report path should reach the server');
  await driver.click('.report__footer .btn--primary');
  await driver.until(() => driver.execute(`return document.querySelector('.report__done-id')?.textContent === 'VR-LINUX'`),
    "report delivered despite a failed readiness check");
  if (reports.length !== 1) throw new Error(`Expected one report, got ${reports.length}`);
  await driver.click('button[aria-label="Close report"]');
}

export async function verifyProjectActions(driver) {
  await driver.rightClick('.workspace-tree__row');
  await driver.until(() => driver.execute(`return Boolean(document.querySelector('.project-context[role="dialog"]'))`),
    "native Linux project context menu");
  await driver.click('.project-context__choices .project-context__danger');
  await driver.until(() => driver.execute(`return Boolean(document.querySelector('.project-context__confirmation'))`),
    "project close confirmation");
  await driver.click('.project-context__buttons button:first-child');
  await driver.click('.project-context__choices button:first-child');
  await driver.keys('#project-context-name', 'Linux QA project');
  await driver.click('.project-context__primary');
  await driver.until(() => driver.execute(`return [...document.querySelectorAll('.workspace-tree__row')]
    .some(row => row.textContent.includes('Linux QA project'))`), "project renamed from native menu");
}
