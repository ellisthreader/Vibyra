import { feedPath } from './macos-update-plan.mjs';

/** Railway redeploy returns before the replacement backend serves the new feed. */
export async function probeMacFeeds(plans, previousVersion, origin,
  { request = fetch, attempts = 18, delayMs = 10000 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const results = await Promise.all(plans.map(async ({ target, entry }) => {
      try {
        const response = await request(`${origin}${feedPath(target, previousVersion)}`);
        const body = response.status === 200 ? await response.json() : null;
        return { platform: target.platform, status: response.status, version: body?.version,
          ok: body?.version === entry.version && body?.signature === entry.signature };
      } catch { return { platform: target.platform, status: 'unavailable', version: '', ok: false }; }
    }));
    if (results.every(result => result.ok)) {
      for (const result of results) console.log(`  ${result.platform}: 200 ${result.version} ✓`);
      return;
    }
    if (attempt === attempts - 1) {
      throw new Error(`Mac feeds did not update: ${results.map(result => `${result.platform} ${result.status} ${result.version ?? ''}`).join(', ')}`);
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
}
