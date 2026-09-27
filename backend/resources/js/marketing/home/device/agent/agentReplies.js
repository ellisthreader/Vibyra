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
