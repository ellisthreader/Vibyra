import assert from 'node:assert/strict';

export async function verifyPerformancePrivacy({ open, check, output }) {
  // 6. Privacy: the three rows, and the destructive one actually reaching Rust
  //    only after it is confirmed.
  {
    const { page: privacy, errors: privacyErrors } = await open("level=balanced");
    const called = () => privacy.evaluate(() => window.ipcCalls().filter(c => c === "clear_terminal_session").length);
    await check("Privacy holds the context switch, the output switch and the saved workspace", async () => {
      await privacy.getByText("Send project context to the assistant", { exact: true }).waitFor();
      await privacy.getByText("Restore terminal output", { exact: true }).waitFor();
      await privacy.getByText("Saved workspace", { exact: true }).waitFor();
    });
    await check("Privacy is one card, like every other block on the page", async () => {
      // Appearance and Performance are each a single group; Privacy was two,
      // which read as a gap in the middle of one section.
      const cards = await privacy.evaluate(() =>
        [...document.querySelectorAll(".settings-block")].map(b => b.querySelectorAll(".settings-group").length));
      assert.deepEqual(cards, [1, 1, 1]);
    });
    await check("every control in a row is the same height and family", async () => {
      // Segmented and stepper sit at 28px on --bg; a default .btn is 36px on
      // --hover and reads as a different kind of control on the same line.
      const heights = await privacy.evaluate(() =>
        [...document.querySelectorAll(".setting-row__control .segmented, .setting-row__control .stepper, .setting-row__control .btn")]
          .map(e => Math.round(e.getBoundingClientRect().height)));
      assert.ok(heights.length >= 4, `only found ${heights.length} controls`);
      assert.deepEqual([...new Set(heights)], [28], `mixed control heights: ${heights}`);
    });
    await check("the destructive half of the confirm is coloured apart", async () => {
      // .btn--danger has no global rule, so an unstyled one looks exactly like
      // the safe button beside it.
      await privacy.getByRole("button", { name: "Clear", exact: true }).click();
      const [keep, clear] = await privacy.evaluate(() =>
        [...document.querySelectorAll(".setting-row__control .btn")].map(b => getComputedStyle(b).backgroundColor));
      assert.notEqual(keep, clear, "Keep and Clear are painted the same");
      await privacy.getByRole("button", { name: "Keep", exact: true }).click();
    });
    await check("the project-context detail lives behind its own ?, not a disclosure", async () => {
      assert.equal(await privacy.getByText("What is sent", { exact: true }).count(), 0);
      await privacy.getByRole("button", { name: "What is sent to the assistant" }).hover();
      const tip = privacy.getByRole("tooltip");
      await tip.waitFor();
      assert.equal(await tip.locator(".setting-hint__list li").count(), 4);
      const box = await tip.boundingBox();
      assert.ok(box.y + box.height <= 900 && box.x + box.width <= 1280, "the panel runs off the window");
      await privacy.screenshot({ path: `${output}/dark-privacy-hint.png` });
      await privacy.mouse.move(640, 120);
      await tip.waitFor({ state: "detached" });
    });
    await check("clearing the saved workspace asks first", async () => {
      assert.equal(await called(), 0);
      await privacy.getByRole("button", { name: "Clear", exact: true }).click();
      await privacy.getByRole("button", { name: "Keep", exact: true }).waitFor();
      assert.equal(await called(), 0, "it cleared before anyone confirmed");
    });
    await check("Keep backs out without deleting anything", async () => {
      await privacy.getByRole("button", { name: "Keep", exact: true }).click();
      await privacy.getByRole("button", { name: "Keep", exact: true }).waitFor({ state: "detached" });
      assert.equal(await called(), 0);
    });
    await check("confirming deletes the saved workspace once", async () => {
      await privacy.getByRole("button", { name: "Clear", exact: true }).click();
      await privacy.getByRole("button", { name: "Clear", exact: true }).click();
      await privacy.getByText("Cleared", { exact: true }).waitFor();
      assert.equal(await called(), 1);
    });
    await privacy.screenshot({ path: `${output}/dark-privacy.png` });
    await check("privacy: no page errors", () => assert.deepEqual(privacyErrors, []));
    await privacy.close();
  }
}
