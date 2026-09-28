// Sample content for the device's Agent Mode. Illustrative only - never
// presented as live teammates. Agent Mode reads like messaging your staff: a
// list of teammates, each with one job, and one conversation each. Mostly the
// jobs a developer hands off, plus two for everyday life. Words follow
// desktop-tauri agentMode/: teammate, decision, place. Agent Mode runs on
// Claude Code or Codex only.

// ApprovalCard.tsx: the risk word decides the verb.
export const RISK_WORDS = {
    read: "reads",
    write: "writes to",
    destructive: "deletes",
    spend: "spends money on",
    publish: "publishes to",
    secret: "reveals",
};

export const ENGINES = {
    claude: "Claude Code",
    codex: "Codex",
};

// Newest first, the way a messaging list sorts. A face names the teammate's
// character picture, drawn by AgentAvatar.jsx. A place is the folder a
// teammate works in; reply is what it says when a message matches nothing in
// replies.
export const teammates = [
    {
        id: "oncall",
        name: "On-call engineer",
        engine: "claude",
        face: "oncall",
        place: "~/projects/orbit",
        time: "09:41",
        reply: "On it. I'll check the logs and the last deploy, and tell you what I find.",
    },
    {
        id: "lead",
        name: "Team lead",
        engine: "claude",
        face: "lead",
        place: "~/projects/orbit",
        unread: true,
        time: "09:30",
        reply: "Got it. I'll hand that to whoever suits it best and keep you posted here.",
    },
    {
        id: "review",
        name: "Code reviewer",
        engine: "codex",
        face: "review",
        place: "~/projects/orbit",
        unread: true,
        time: "09:12",
        reply: "I'll read it line by line and leave a comment wherever something needs fixing.",
    },
    {
        id: "bugs",
        name: "Bug fixer",
        engine: "claude",
        face: "bugs",
        place: "~/projects/orbit",
        time: "08:52",
        reply: "On it. I'll reproduce it first, then show you the fix and the test that proves it.",
    },
    {
        id: "assistant",
        name: "Personal assistant",
        engine: "claude",
        face: "assistant",
        place: "~/Documents",
        time: "08:15",
        reply: "Leave it with me. I'll sort it out and show you what changed. Nothing gets deleted.",
    },
    {
        id: "db",
        name: "Database admin",
        engine: "codex",
        face: "db",
        place: "~/projects/orbit/db",
        time: "Yesterday",
        reply: "I'll measure it first, then show you the numbers before and after any change.",
    },
    {
        id: "site",
        name: "Website helper",
        engine: "codex",
        face: "site",
        place: "~/sites/bakery",
        time: "Yesterday",
        reply: "I'll change it on a preview first, so you can see it before anything goes live.",
    },
    {
        id: "qa",
        name: "QA tester",
        engine: "codex",
        face: "qa",
        place: "~/projects/orbit",
        time: "Monday",
        reply: "I'll test it on phone and desktop sizes and write down anything that breaks.",
    },
];

// Teammates made with + start as a sprout until the user chooses an avatar.
export const newTeammates = { face: "sprout" };

// One conversation per teammate. A decision is a message with an approval
// card under it; it stays open until you answer it in the thread.
export const threads = {
    oncall: [
        { kind: "stamp", text: "Today 09:32" },
        { from: "them", text: "Heads up: checkout is failing for 1 in 20 orders since 09:14." },
        { from: "you", text: "What's causing it?" },
        { from: "them", text: "A deleted product has no price, so the cart total is NaN." },
        { kind: "file", name: "hotfix/cart-total", meta: "1 file changed, +4 −1", icon: "branch" },
        {
            kind: "decision",
            id: "d1",
            text: "Fixed, with a test. All 212 tests pass. Shall I ship it?",
            risk: "publish",
            target: "github.com/vibyra/orbit",
            detail: "git push origin hotfix/cart-total",
            approved: {
                reply: "Shipped. Checkout errors are back to zero, and I'll keep watching for the next hour.",
                notice: "Approved. On-call engineer shipped the fix.",
            },
            denied: {
                reply: "Okay, not shipped. The fix is on its branch if you want to read it first.",
                notice: "Denied. Nothing was pushed.",
            },
        },
    ],
    lead: [
        { kind: "stamp", text: "Today 09:28" },
        { from: "them", text: "Morning. Overnight, Code reviewer went through 3 pull requests and Bug fixer closed 2 issues." },
        { from: "them", text: "Two things need you: On-call has a fix ready to ship, and Database admin wants to remove an old column." },
        { from: "you", text: "Thanks. Which first?" },
        { from: "them", text: "The fix. Some orders keep failing at checkout until it's out." },
    ],
    review: [
        { kind: "stamp", text: "Today 09:05" },
        { from: "them", text: "Reviewed pull request #214, the new saved cards screen." },
        { from: "them", text: "Two things before it merges: card numbers are written to the logs, and there's no loading state." },
        { kind: "file", name: "Pull request #214", meta: "2 comments, 1 must fix", icon: "file" },
        { from: "them", text: "Both are on the pull request as comments, with a suggested fix." },
    ],
    bugs: [
        { kind: "stamp", text: "Today 08:40" },
        { from: "you", text: "People land on the home page after signing in. Can you look?" },
        { from: "them", text: "Found it. The redirect dropped ?next= after sign-in." },
        { from: "them", text: "Fixed in auth/redirect.ts, with a test so it can't come back." },
        { kind: "file", name: "fix/sign-in-redirect", meta: "2 files changed, +18 −3", icon: "branch" },
    ],
    assistant: [
        { kind: "stamp", text: "Today 08:02" },
        { from: "you", text: "My Downloads folder is a mess, and I need my receipts for my tax return." },
        { from: "them", text: "Sorted 214 files into 6 folders. Nothing was deleted." },
        { from: "them", text: "Your 38 receipts are in one spreadsheet, by month and by shop." },
        { kind: "file", name: "Receipts 2026.xlsx", meta: "38 receipts, £1,284 in total", icon: "file" },
    ],
    db: [
        { kind: "stamp", text: "Yesterday 18:20" },
        { from: "you", text: "The orders page takes 4 seconds to load. Why?" },
        { from: "them", text: "It reads every order to find yours. An index on user_id takes it from 4s to 40ms." },
        { kind: "file", name: "add-orders-user-index.sql", meta: "Migration, ready on a branch", icon: "file" },
        {
            kind: "decision",
            id: "d2",
            text: "Also, orders.legacy_status hasn't been read in 90 days. Shall I remove it?",
            risk: "destructive",
            target: "orders.legacy_status",
            detail: "ALTER TABLE orders DROP COLUMN legacy_status;",
            approved: {
                reply: "Removed. I kept a backup of the column in case you ever need it back.",
                notice: "Approved. Database admin removed the old column.",
            },
            denied: {
                reply: "Okay, it stays. I've left a note about it in the migration.",
                notice: "Denied. The column stays.",
            },
        },
    ],
    site: [
        { kind: "stamp", text: "Yesterday 15:40" },
        { from: "you", text: "Can you put our new opening hours on the website? We close at 4 on Sundays now." },
        { from: "them", text: "Done. Sundays now say 8am to 4pm on the home page and the contact page." },
        { kind: "file", name: "Bakery website preview", meta: "Opening hours updated on 2 pages", icon: "file" },
    ],
    qa: [
        { kind: "stamp", text: "Monday 17:20" },
        { from: "you", text: "Can you test checkout before the release?" },
        { from: "them", text: "Wrote 14 tests and went through checkout on phone and desktop sizes." },
        { from: "them", text: "Found one real bug: a 100% coupon still charges £0.01." },
        { kind: "handoff", text: "Handed the coupon bug to Bug fixer" },
    ],
};

// Canned answers, chosen by what the message is about, most specific first.
// Anything else gets the teammate's own reply, in the voice of its job. None
// of them claims work the thread has not shown.
const replies = [
    [/\b(every|daily|morning|schedule|remind|routine)\b/i, "I can make that a routine. It runs on schedule while Vibyra is open."],
    [/\b(tests?|suite|coverage)\b/i, "I'll run the suite, then write tests for anything that isn't covered yet."],
    [/\b(bug|fix|broken|crash|errors?)\b/i, "On it. I'll reproduce it first, then show you the fix and the test that proves it."],
    [/\b(ship|release|push|deploy)\b/i, "I'll check it against the diff first, and ask you before anything is pushed."],
    [/\b(thanks|thank you|great|nice|perfect)\b/i, "Any time. I'll keep an eye on it and message you here if anything changes."],
];

export const replyTo = (text, teammate) => {
    const match = replies.find(([pattern]) => pattern.test(text));
    if (match) return match[1];
    return teammate.reply ?? `Got it. I'll work on that in ${teammate.place} and check with you before anything risky.`;
};

export const firstHello =
    "Hi, I'm new here. Tell me what to look after. I only work in the folders you give me, and I ask before anything risky.";
