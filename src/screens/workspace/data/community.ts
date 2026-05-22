import { CommunityPost } from "../types";

export const communityDetailAccent = "#8B35FF";
export const communityDetailAccentDark = "#5D24D8";
export const COMMUNITY_COMMENTS_KEY = "vibyra.community.comments.v1";
export const COMMUNITY_SAMPLE_POST_PREFIX = "sample-";

const samplePreviewBase = `
  * { box-sizing: border-box; }
  body { margin: 0; background: #080A12; color: #F8F5FF; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  button { border: 0; color: inherit; font: inherit; }
  .app { min-height: 100vh; padding: 18px; background: radial-gradient(circle at top left, rgba(139, 53, 255, 0.32), transparent 34%), #080A12; }
  .top { align-items: center; display: flex; justify-content: space-between; margin-bottom: 18px; }
  .brand { font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: #CFC7FF; }
  .pill { background: rgba(255,255,255,.09); border: 1px solid rgba(255,255,255,.12); border-radius: 999px; color: #DCD7EA; padding: 7px 10px; font-size: 12px; font-weight: 700; }
  h1 { font-size: 29px; line-height: 1.04; margin: 0 0 10px; max-width: 340px; }
  p { color: #BDB6CB; line-height: 1.5; margin: 0; }
  .grid { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 18px; }
  .card { background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.1); border-radius: 14px; padding: 13px; min-height: 94px; }
  .label { color: #9F98B0; font-size: 12px; font-weight: 750; margin-bottom: 8px; }
  .value { font-size: 22px; font-weight: 900; }
  .wide { grid-column: 1 / -1; }
  .row { align-items: center; display: flex; justify-content: space-between; gap: 10px; padding: 10px 0; border-top: 1px solid rgba(255,255,255,.08); }
  .row:first-child { border-top: 0; }
  .cta { background: linear-gradient(135deg, #8B35FF, #14B8A6); border-radius: 12px; display: block; margin-top: 18px; padding: 13px; text-align: center; font-weight: 900; width: 100%; }
`;

const launchBoardPreview = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${samplePreviewBase}</style></head><body><main class="app">
  <div class="top"><div class="brand">Launch Board</div><div class="pill">Week 4</div></div>
  <h1>Ship the beta without losing the thread.</h1>
  <p>Track product tasks, launch notes, and user feedback from one compact command board.</p>
  <section class="grid">
    <div class="card"><div class="label">Ready</div><div class="value">12</div></div>
    <div class="card"><div class="label">Blocked</div><div class="value">3</div></div>
    <div class="card wide"><div class="row"><span>Pricing page copy</span><strong>Today</strong></div><div class="row"><span>Invite first 25 testers</span><strong>Fri</strong></div><div class="row"><span>Record demo clip</span><strong>Next</strong></div></div>
  </section>
  <button class="cta">Add launch task</button>
</main></body></html>`;

const habitFlowPreview = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${samplePreviewBase}</style></head><body><main class="app" style="background: radial-gradient(circle at top right, rgba(20,184,166,.34), transparent 34%), #071211;">
  <div class="top"><div class="brand">Habit Flow</div><div class="pill">4 day streak</div></div>
  <h1>Small routines, checked in calmly.</h1>
  <p>A daily view for habits that need consistency, not pressure.</p>
  <section class="grid">
    <div class="card"><div class="label">Focus</div><div class="value">82%</div></div>
    <div class="card"><div class="label">Done</div><div class="value">5/7</div></div>
    <div class="card wide"><div class="row"><span>Morning walk</span><strong>Done</strong></div><div class="row"><span>Deep work block</span><strong>2pm</strong></div><div class="row"><span>Read 20 pages</span><strong>Tonight</strong></div></div>
  </section>
  <button class="cta" style="background: linear-gradient(135deg, #14B8A6, #8B5CF6);">Complete check-in</button>
</main></body></html>`;

export const communityPosts: CommunityPost[] = [
  {
    accent: "#8B35FF",
    appUrl: "",
    about: "A personal launch board for solo builders. It keeps daily tasks, launch notes, and customer feedback in one small workspace so a side project can keep moving without a full PM tool.",
    comments: 0,
    description: "Plan a side project launch with tasks, milestones, and feedback in one focused board.",
    id: "sample-launch-board",
    isPublic: true,
    likes: 128,
    logo: "analytics",
    makerBio: "Indie maker building tiny tools for repeatable launches.",
    preview: "analytics",
    previewHtml: launchBoardPreview,
    reviewStatus: "approved",
    safetyRating: "safe",
    safetyScore: 96,
    screenshots: ["Dashboard", "Launch tasks"],
    screenshotUrls: [],
    tag: "Featured",
    tags: ["Featured", "Productivity", "Startup", "Dashboard"],
    time: "2h ago",
    title: "launch board",
    user: "Maya Chen"
  },
  {
    accent: "#14B8A6",
    appUrl: "",
    about: "A calm habit tracker that turns recurring routines into short daily sessions. It is designed for people who want a lightweight check-in instead of streak pressure.",
    comments: 0,
    description: "Track small habits with weekly insights, gentle streaks, and a clean daily check-in.",
    id: "sample-habit-flow",
    isPublic: true,
    likes: 94,
    logo: "habit",
    makerBio: "Designer experimenting with wellness apps and simple analytics.",
    preview: "habit",
    previewHtml: habitFlowPreview,
    reviewStatus: "approved",
    safetyRating: "safe",
    safetyScore: 94,
    screenshots: ["Today", "Insights"],
    screenshotUrls: [],
    tag: "Recent",
    tags: ["Health", "Habits", "Mobile", "Wellness"],
    time: "Yesterday",
    title: "habit flow",
    user: "Nora Patel"
  },
  {
    accent: "#F59E0B",
    appUrl: "",
    about: "A compact invoice tracker for freelancers. It highlights overdue payments, upcoming invoices, and monthly revenue without requiring an accounting setup.",
    comments: 0,
    description: "Watch invoices, payment status, and monthly revenue from a compact freelance dashboard.",
    id: "sample-invoice-pulse",
    isPublic: true,
    likes: 76,
    logo: "invoice",
    makerBio: "Freelance developer building practical finance tools.",
    preview: "invoice",
    reviewStatus: "approved",
    safetyRating: "safe",
    safetyScore: 92,
    screenshots: ["Invoices", "Revenue"],
    screenshotUrls: [],
    tag: "Popular",
    tags: ["Finance", "Freelance", "Invoices", "SaaS"],
    time: "3d ago",
    title: "invoice pulse",
    user: "Leo Martin"
  },
  {
    accent: "#EC4899",
    appUrl: "",
    about: "A lightweight content calendar for creators. It groups post ideas, channels, draft status, and launch dates in a simple weekly view.",
    comments: 0,
    description: "Organize creator content ideas, channels, drafts, and scheduled posts in one place.",
    id: "sample-content-calendar",
    isPublic: true,
    likes: 61,
    logo: "default",
    makerBio: "Creator building tools for planning without spreadsheet sprawl.",
    preview: "analytics",
    reviewStatus: "approved",
    safetyRating: "safe",
    safetyScore: 91,
    screenshots: ["Calendar", "Draft queue"],
    screenshotUrls: [],
    tag: "Recent",
    tags: ["Creator", "Calendar", "Marketing", "Planning"],
    time: "5d ago",
    title: "content calendar",
    user: "Ari Brooks"
  }
];

export function isSampleCommunityPostId(id: string) {
  return id.startsWith(COMMUNITY_SAMPLE_POST_PREFIX);
}
