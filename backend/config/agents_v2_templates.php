<?php

/*
 * Agent V2 starter teammates (Phase 8). Creating one from a template saves only
 * the teammate profile. `suggested` is shown to the person as suggestions: every
 * grant, schedule and trigger still needs its own explicit call and confirmation.
 * Schedules/triggers use the same shapes as POST /schedules and POST /triggers.
 */
return [
    'inbox_triage' => [
        'name' => 'Inbox triage', 'avatar' => 'assistant',
        'brief' => 'Read my new email, sort what needs me from what does not, and draft short replies for the ones that need an answer. Never send anything without my approval.',
        'providers' => [['provider' => 'gmail', 'operations' => ['gmail_search', 'gmail_read', 'gmail_send'],
            'why' => 'Reads new mail; a reply is sent only after you approve it.']],
        'schedule' => null,
        'trigger' => ['kind' => 'gmail.message', 'filter' => ['query' => 'is:unread -category:promotions', 'pollMinutes' => 5],
            'promptTemplate' => 'A new email arrived. Tell me if it needs me and draft a reply if it does.'],
    ],
    'pr_shepherd' => [
        'name' => 'PR shepherd', 'avatar' => 'review',
        'brief' => 'Watch my GitHub pull requests: summarize what changed, point out anything blocking review, and leave a comment only when I approve it.',
        'providers' => [['provider' => 'github', 'operations' => ['github_list_pull_requests', 'github_read_issue',
            'github_read_file', 'github_comment_issue'], 'why' => 'Reads pull requests; comments need your approval.']],
        'schedule' => null,
        'trigger' => ['kind' => 'github.pull_request', 'filter' => ['actions' => ['opened', 'ready_for_review']],
            'promptTemplate' => 'A pull request was opened. Summarize it and list anything blocking review.'],
    ],
    'morning_brief' => [
        'name' => 'Morning brief', 'avatar' => 'lead',
        'brief' => 'Each morning, give me one short brief: today\'s meetings, email that needs me, and anything urgent. Read only.',
        'providers' => [
            ['provider' => 'google_calendar', 'operations' => ['google_calendar_list_calendars', 'google_calendar_list_events'],
                'why' => 'Reads today\'s meetings.'],
            ['provider' => 'gmail', 'operations' => ['gmail_search', 'gmail_read'], 'why' => 'Reads email that arrived overnight.'],
        ],
        'schedule' => ['recurrence' => ['type' => 'weekly', 'weekdays' => [1, 2, 3, 4, 5], 'time' => '08:00'],
            'prompt' => 'Write my morning brief for today.'],
        'trigger' => null,
    ],
    'meeting_prep' => [
        'name' => 'Meeting prep', 'avatar' => 'sprout',
        'brief' => 'Before each meeting, gather the related email threads and documents and give me a short prep note: who, why, open questions.',
        'providers' => [
            ['provider' => 'google_calendar', 'operations' => ['google_calendar_list_calendars', 'google_calendar_list_events'],
                'why' => 'Finds the meeting and who is in it.'],
            ['provider' => 'gmail', 'operations' => ['gmail_search', 'gmail_read'], 'why' => 'Finds related threads.'],
            ['provider' => 'google_drive', 'operations' => ['google_drive_search', 'google_drive_read'], 'why' => 'Finds related documents.'],
        ],
        'schedule' => null,
        'trigger' => ['kind' => 'calendar.event_soon', 'filter' => ['calendarId' => 'primary', 'leadMinutes' => 30],
            'promptTemplate' => 'A meeting starts soon. Prepare me for it.'],
    ],
];
