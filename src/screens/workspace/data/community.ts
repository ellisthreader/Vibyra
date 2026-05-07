import { CommunityPost } from "../types";

export const communityDetailAccent = "#8B35FF";
export const communityDetailAccentDark = "#5D24D8";
export const COMMUNITY_COMMENTS_KEY = "vibyra.community.comments.v1";

export const communityPosts: CommunityPost[] = [
  {
    accent: "#9B5CFF",
    appUrl: "https://vibyra.app/community/ai-invoice-tool",
    about: "AI Invoice Tool helps freelancers and SaaS teams turn rough billing notes into polished invoices, follow-up emails, and payment summaries. It is built for quick client work where accuracy, presentation, and speed matter.",
    comments: 9,
    description: "Automate invoices and billing with AI. Save hours of work.",
    id: "ai-invoice-tool",
    likes: 42,
    logo: "invoice" as const,
    makerBio: "Maya is a product designer building calm finance tools for independent studios.",
    preview: "invoice" as const,
    screenshots: ["Invoice dashboard", "Client payment timeline", "AI billing assistant"],
    tag: "Popular",
    tags: ["SaaS", "AI"],
    time: "2h ago",
    title: "AI invoice tool",
    user: "Maya"
  },
  {
    accent: "#51E895",
    appUrl: "https://vibyra.app/community/habit-tracker-app",
    about: "Habit Tracker App turns tiny daily goals into a simple rhythm with streaks, reminders, reflection prompts, and progress summaries that are easy to scan at a glance.",
    comments: 4,
    description: "Track habits, build consistency, and achieve your goals.",
    id: "habit-tracker-app",
    likes: 18,
    logo: "habit" as const,
    makerBio: "Noah builds wellness utilities with soft visuals and practical routines.",
    preview: "habit" as const,
    screenshots: ["Daily streak board", "Weekly reflection", "Goal setup flow"],
    tag: "Recent",
    tags: ["Productivity", "Health"],
    time: "5h ago",
    title: "Habit tracker app",
    user: "Noah"
  },
  {
    accent: "#5792FF",
    appUrl: "https://vibyra.app/community/saas-analytics-board",
    about: "SaaS Analytics Board gives founders a clean view of revenue, activation, retention, and churn signals without needing a heavy BI setup.",
    comments: 6,
    description: "Beautiful analytics dashboard for SaaS founders.",
    id: "saas-analytics-board",
    likes: 31,
    logo: "analytics" as const,
    makerBio: "Leah is a full-stack maker focused on decision tools for early-stage teams.",
    preview: "analytics" as const,
    screenshots: ["Revenue overview", "Retention health", "Founder weekly brief"],
    tag: "Featured",
    tags: ["SaaS", "Analytics"],
    time: "1d ago",
    title: "SaaS analytics board",
    user: "Leah"
  }
];
