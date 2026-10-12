const day = 86400000;
export function fixtureReport(days = 30, scenario = "normal") {
  const to = new Date("2026-10-12T12:00:00Z");
  const from = new Date(+to - (days - 1) * day);
  const daily = Array.from({ length: days }, (_, i) => ({
    date: new Date(+from + i * day).toISOString().slice(0, 10),
    downloads: [2, 4, 1, 7, 3, 0, 5][i % 7], page_views: 12 + (i * 17) % 38,
    unique_visitors: 4 + i % 9, app_opens: i % 7, prompts_submitted: i % 3,
    chat_prompts: i % 2, project_prompts: i % 4, turns: i % 6, users: i % 3,
    errors: i === 4 ? 1 : 0, slow_loads: i % 9 === 0 ? 1 : 0,
  }));
  const total = daily.reduce((sum, row) => sum + row.downloads, 0);
  const report = {
    ok: true, range: { days, from: from.toISOString(), to: to.toISOString() },
    overview: {
      accounts: { total: 156, registered: 128, guests: 28, active_30d: 58 },
      operations: { new_registered: 24, cloud_users: 16, accounts_used_24h: 12, accounts_used_7d: 34, cloud_last_turn_at: to.toISOString() },
      website: { downloads: total, verified_purchases: 8, unique_visitors: 264, page_views: 1024, signups: 12, waitlist_signups: 6, engaged_seconds: 12840, recent_engaged_sessions_5m: 3, download_clicks: 52 },
      desktop: { active_users: 42, app_opens: 96, projects_created: 14, prompts_submitted: 31, engaged_seconds: 32640, recent_engaged_sessions_5m: 2 },
      mobile: { active_users: 18, app_opens: 54, chat_prompts: 10, project_prompts: 12, engaged_seconds: 18480, recent_engaged_sessions_5m: 1 },
      ai: { vibes_turns: 81, completed_turns: 79, failed_turns: 2, spend_micro_usd: 6240 },
    },
    series: { website: daily, desktop: daily, mobile: daily, cloud: daily },
    breakdowns: {
      memberships: [{ plan: "free", count: 104 }, { plan: "pro", count: 24 }],
      downloads: [{ platform: "macos-arm64", count: 38 }, { platform: "windows", count: 24 }, { platform: "macos-x64", count: 12 }, { platform: "linux", count: 10 }, { platform: "linux-deb", count: 4 }],
      prompt_models: [{ model: "openai/gpt-5.6-luna", count: 52 }, { model: "qwen/qwen3.8-flash", count: 29 }],
      models: [{ surface: "desktop", model: "openai/gpt-5.6-luna", count: 18 }],
      website_pages: [{ path: "/", count: 420 }, { path: "/downloads", count: 128 }, { path: "/checkout", count: 80 }],
      website_ctas: [{ action: "nav_downloads", count: 52 }],
      website_channels: [{ label: "direct", count: 160 }, { label: "referral", count: 104 }],
      website_referrers: [{ label: "t.co", count: 34 }],
      website_sources: [], website_campaigns: [],
      website_landing_pages: [{ label: "/", count: 240 }],
      website_exit_pages: [{ label: "/downloads", count: 100 }],
      website_funnels: [{ name: "Signup", visited: 264, started: 26, completed: 12 }, { name: "Download", visited: 264, started: 52, completed: 38 }, { name: "Phone waitlist", visited: 264, started: 9, completed: 6 }],
      website_download_clicks: [{ platform: "windows", count: 18 }],
      website_performance: [{ metric: "ttfb", good: 21, samples: 24 }, { metric: "lcp", good: 14, samples: 20 }, { metric: "inp", good: 12, samples: 12 }],
      website_errors: [], website_devices: [{ label: "desktop", count: 180 }, { label: "mobile", count: 84 }],
      website_browsers: [{ label: "chrome", count: 190 }, { label: "safari", count: 74 }],
      website_countries: [{ country: "GB", count: 142 }], website_regions: [{ region: "GB-LND", count: 68 }],
      desktop_events: [{ event: "desktop_project_opened", count: 80 }, { event: "desktop_terminal_started", count: 42 }, { event: "desktop_engagement_interval", count: 420 }],
      mobile_events: [{ event: "mobile_project_opened", count: 26 }, { event: "mobile_preview_opened", count: 16 }],
      desktop_platforms: [{ platform: "macos", count: 64 }, { platform: "windows", count: 32 }],
      desktop_providers: [{ provider: "codex", count: 28 }, { provider: "claude", count: 14 }],
      desktop_prompt_providers: [{ provider: "codex", count: 20 }], desktop_project_kinds: [],
      mobile_screens: [{ screen: "home", count: 32 }, { screen: "projects", count: 22 }],
      mobile_platforms: [{ platform: "ios", count: 54 }], mobile_chat_efforts: [], mobile_project_providers: [],
    },
    data_quality: {
      retention_days: 90, tracking_started_at: "2026-09-28T10:00:00Z",
      tracking_by_surface: { website: "2026-10-01T10:00:00Z", desktop: "2026-09-30T10:00:00Z", mobile: "2026-09-28T10:00:00Z" },
      last_event_by_surface: { website: to.toISOString(), desktop: to.toISOString(), mobile: "2026-10-04T10:00:00Z" },
      cloud_turns_available: true, website_details_available: true, website_ingestion_enabled: true, website_geo_available: true,
      website_ingest_counts: { accepted: 1254, rejected: 0, blocked: 14 },
      current_consent_choices: [{ surface: "website", choice: "aggregate", count: 120 }, { surface: "website", choice: "declined", count: 32 }],
      notes: ["Sessions describe recorded browsers and app sessions, not unique people.", "Downloads are accepted responses, not completed installations.", "Current Pro plans do not establish a paid subscription."],
    },
  };
  if (scenario === "empty" || scenario === "unavailable") {
    for (const group of Object.values(report.overview)) for (const key of Object.keys(group)) group[key] = scenario === "empty" ? 0 : null;
    for (const key of Object.keys(report.breakdowns)) report.breakdowns[key] = scenario === "empty" ? [] : null;
    for (const key of Object.keys(report.series)) report.series[key] = [];
    report.data_quality.tracking_by_surface = {};
    report.data_quality.last_event_by_surface = {};
  }
  if (scenario === "sparse") {
    report.series.website = [{ date: "2026-10-10", downloads: 1 }, { date: "2026-10-11", downloads: null }, { date: "2026-10-12", downloads: 0 }];
    report.series.mobile = [{ date: "2026-10-12", app_opens: 1, project_prompts: 0 }];
  }
  if (scenario === "stale") Object.assign(report.data_quality, { source: "production", captured_at: "2026-10-01T10:00:00Z" });
  return report;
}
export function fixtureAccounts(page = 1) {
  return { ok: true, page, per_page: 25, last_page: 2, total: 28,
    accounts: Array.from({ length: page === 1 ? 25 : 3 }, (_, i) => ({
      id: (page - 1) * 25 + i + 1, name: i === 1 ? "Guest" : ["Alex Morgan", "Guest", "Sam Rivera", "Taylor — a deliberately long account name for layout testing"][i % 4],
      email: i === 1 ? "guest-preview-only@guests.vibyra.invalid" : "sample.person." + i + "@example.test",
      plan: i % 3 === 0 ? "pro" : "free", created_at: "2026-10-11T09:34:00Z",
      email_verified_at: i % 2 ? null : "2026-10-11T09:35:00Z",
      last_login_at: i % 2 ? null : "2026-10-12T08:30:00Z", logins_30d: i % 5,
      last_session_used_at: i % 2 ? null : "2026-10-12T09:00:00Z", recent_sessions_5m: 0,
    })),
  };
}
export const fixtureLicenses = [
  { id: "demo-ready", label: "Early supporter", key_suffix: "DEMO", tokens: 300, allowance: "monthly", duration_months: 3, claim_by: "2026-12-30 12:00:00", redeemed_at: null, revoked_at: null, ends_at: null },
  { id: "demo-active", label: "Beta group", key_suffix: "TEST", tokens: 600, allowance: "once", duration_months: 3, claim_by: "2026-10-30 12:00:00", redeemed_at: "2026-10-01 12:00:00", redeemed_email: "sample@example.test", revoked_at: null, ends_at: "2027-01-01 12:00:00" },
  { id: "demo-expired", label: "Launch trial", key_suffix: "PAST", tokens: 100, allowance: "once", duration_months: 1, claim_by: "2026-09-01 12:00:00", redeemed_at: null, revoked_at: null, ends_at: null },
  { id: "demo-revoked", label: "Retired invite", key_suffix: "VOID", tokens: 100, allowance: "once", duration_months: 1, claim_by: "2026-12-01 12:00:00", redeemed_at: null, revoked_at: "2026-10-01 12:00:00", ends_at: null },
];
