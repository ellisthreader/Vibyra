<?php

/*
 * Agent V2: runs execute on the person's selected AI account on their Mac.
 * Nothing on this path reserves, debits or settles Vibes, and nothing calls
 * OpenRouter. Off by default; a run needs the flag AND a cohort entry.
 */
return [
    'parallel_jobs_enabled' => (bool) env('AGENT_PARALLEL_JOBS_ENABLED', false),
    'coordination_enabled' => (bool) env('AGENT_COORDINATION_ENABLED', false),
    'work_enabled' => (bool) env('AGENT_WORK_ENABLED', false),
    'cloud_enabled' => (bool) env('AGENT_CLOUD_ENABLED', false),
    'outputs_enabled' => env('AGENT_OUTPUTS_ENABLED', false),
    'enabled' => (bool) env('AGENTS_V2_ENABLED', false),
    // Comma-separated user IDs, or `*` for every account. Empty means nobody.
    'user_ids' => (string) env('AGENTS_V2_USER_IDS', ''),
    // Phase 3: derive inbox items + push outbox rows from the four run hooks.
    // Also needs NOTIFICATIONS_INBOX_ENABLED (and NOTIFICATIONS_PUSH_ENABLED for phones).
    'notifications' => (bool) env('AGENTS_V2_NOTIFICATIONS_ENABLED', false),
    // F-03: runner endpoints authenticate with the per-binding runner key alone (the Mac holds no account session).
    // An Authorization header from an older runner is ignored. false restores the legacy session + key double check.
    'runner_key_only' => (bool) env('AGENTS_V2_RUNNER_KEY_ONLY', true),
    // A claimed run's lease; a runner renews it with heartbeats.

    'lease_seconds' => 90,
    // A binding seen this recently counts as an online computer at admission.
    'online_seconds' => 120,
    // An exact write approval expires this long after it was prepared.
    'approval_seconds' => 900,
    // Permission-filtered tools offered to one run.
    'max_tools' => 10,
    'max_tool_calls' => 40,
    'max_prompt_chars' => 20000,
    'max_attachments' => 8,
    'max_event_bytes' => 8000,
    // F-13: runner chatter (message.delta, status) stops at this many journal events per run; refused tool calls are kept up to a cap.
    'max_journal_events' => (int) env('AGENTS_V2_MAX_JOURNAL_EVENTS', 2000),
    'max_refused_calls' => (int) env('AGENTS_V2_MAX_REFUSED_CALLS', 50),
    'max_result_bytes' => 32000,
    // A longer final answer is clipped with a notice, never refused (F-05).
    'max_answer_chars' => 60000,
    // F-05: attempts a run gets when its runner's lease keeps lapsing; then it fails runner_error. Waits do not count.
    'max_claims' => (int) env('AGENTS_V2_MAX_CLAIMS', 3),
    // An action a dead process left `dispatching` is closed by vibyra:agent-v2-sweep-dispatching after this many minutes:
    // a write becomes `unknown` (never re-sent, one read-only lookup first), a read fails retryable. Mac-claimed actions wait for lease loss too.
    'dispatch_stale_minutes' => (int) env('AGENTS_V2_DISPATCH_STALE_MINUTES', 5),
    // F-04: how long a finished run's journal and attachment files are kept (vibyra:agent-v2-retention, daily). 0 turns a rule off.
    // Receipts are the audit trail and stay. Uploads nobody attached are removed after `unattached_hours`.
    'retention' => [
        'events_days' => (int) env('AGENTS_V2_EVENT_RETENTION_DAYS', 90),
        'attachments_days' => (int) env('AGENTS_V2_ATTACHMENT_RETENTION_DAYS', 30),
        'unattached_hours' => (int) env('AGENTS_V2_UNATTACHED_HOURS', 48),
    ],
    // Bumping this invalidates every outstanding approval fingerprint.
    'policy_revision' => 1,
    // Phase 5 routines: default catch-up window for an occurrence (offline Mac, scheduler outage),
    // after which it expires with a reason. Per-account caps on saved schedules and triggers.
    'schedule_catch_up_minutes' => 60,
    'max_schedules' => 50,
    'max_triggers' => 25,
    // Part 4 triggers. One run per subject (Linear issue, Slack thread, GitHub issue) while an earlier one on it is live,
    // for this long; Linear's `webhookTimestamp` and Slack's request timestamp must be this fresh. The Slack app's single
    // signing secret (Event Subscriptions) lives only in the environment; without it hooks/slack answers 404.
    'subject_window_minutes' => (int) env('AGENTS_V2_SUBJECT_WINDOW_MINUTES', 60),
    'linear_tolerance_seconds' => (int) env('AGENTS_V2_LINEAR_TOLERANCE_SECONDS', 60),
    'slack_tolerance_seconds' => 300,
    'slack_signing_secret' => (string) env('SLACK_SIGNING_SECRET', ''),
];
