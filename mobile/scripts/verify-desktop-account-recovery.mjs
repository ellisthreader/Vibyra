import assert from 'node:assert/strict';

export async function verifyAccountRecovery({ open, t, shot, theme, last }) {
    // ── the rows that only appear when they have to ──────────────────────
    const warnings = await open(`${t}nokeyring&unverified&photo`);
    await warnings.page.getByText('Session is not remembered').waitFor();
    await warnings.page.getByText('Email not verified').waitFor();
    assert.equal(await warnings.page.locator('.account-card__photo').evaluate(el => el.complete && el.naturalWidth > 0), true);
    await warnings.page.getByText('Member since March 2026').waitFor();
    await shot(warnings.page, `warnings-${theme}`);

    // ── a read that failed says so, rather than going quiet ──────────────
    const offline = await open(`${t}fail=credits,devices,two_factor_status`);
    await offline.page.getByText('Credits unavailable').waitFor();
    await offline.page.getByText('Devices unavailable').waitFor();
    await offline.page.getByRole('group', { name: 'Two-factor authentication' })
      .getByRole('button', { name: 'Try again' }).waitFor();
    await offline.page.getByRole('group', { name: 'Credits unavailable' }).getByRole('button', { name: 'Try again' }).click();
    assert.equal((await last(offline.page))[0], 'account_credits');

    // ── the code half of a sign-in ───────────────────────────────────────
    const code = await open(`${t}auth2fa`);
    await code.page.getByText(/Enter the code from your authenticator app/).waitFor();
    await code.page.getByLabel('Two-factor code').fill('000000');
    await code.page.getByRole('button', { name: 'Continue' }).click();
    await code.page.getByText(/didn’t match/).waitFor();
    await shot(code.page, `sign-in-code-${theme}`);
    await code.page.getByLabel('Two-factor code').fill('123456');
    await code.page.getByRole('button', { name: 'Continue' }).click();
    await code.page.getByRole('dialog', { name: 'Settings' }).waitFor().catch(() => {});

  return { warnings, offline, code };
}
