<?php

namespace App\Services\Agents;

/** Picks a bounded set of a teammate's existing grants for this task's quote. */
final class ConnectorSelection
{
    private const TERMS = [
        'github' => ['repo', 'repository', 'pull request', 'pull requests', 'pr', 'prs', 'commit', 'commits', 'branch', 'branches', 'github'],
        'stripe' => ['payment', 'payments', 'revenue', 'refund', 'refunds', 'balance', 'customer', 'customers', 'invoice', 'invoices', 'subscription', 'subscriptions', 'stripe'],
        'figma' => ['design', 'designs', 'frame', 'mockup', 'mockups', 'wireframe', 'prototype', 'figma'],
        'gmail' => ['email', 'emails', 'e-mail', 'e-mails', 'mail', 'inbox', 'newsletter', 'newsletters', 'unread', 'correspondence', 'reply', 'draft', 'sender', 'gmail'],
        'google_calendar' => ['calendar', 'meeting', 'meetings', 'event', 'events', 'schedule', 'agenda', 'appointment', 'appointments', 'availability', 'free time'],
        'google_drive' => ['drive', 'document', 'documents', 'doc', 'sheet', 'slide', 'file', 'files', 'spreadsheet', 'spreadsheets', 'presentation', 'presentations'],
        'outlook_mail' => ['email', 'emails', 'e-mail', 'e-mails', 'mail', 'inbox', 'newsletter', 'newsletters', 'unread', 'correspondence', 'reply', 'draft', 'sender', 'outlook'],
        'outlook_calendar' => ['calendar', 'meeting', 'meetings', 'event', 'events', 'schedule', 'agenda', 'appointment', 'appointments', 'availability', 'free time', 'outlook'],
        'onedrive' => ['onedrive', 'document', 'documents', 'file', 'files', 'microsoft file'],
        'teams' => ['teams', 'chat', 'chats', 'workplace message'],
        'sharepoint' => ['sharepoint', 'site', 'sites', 'document', 'documents', 'file', 'files'],
        'google_tasks' => ['task', 'tasks', 'todo', 'to-do', 'checklist', 'reminder', 'reminders'],
        'deepwiki' => ['deepwiki', 'documentation', 'docs', 'repository docs', 'codebase question'],
        'slack' => ['slack', 'channel', 'channels', 'workspace message'],
        'notion' => ['notion', 'page', 'pages', 'notes', 'wiki'],
        'linear' => ['linear', 'issue', 'issues', 'ticket', 'tickets', 'sprint', 'backlog'],
    ];

    /** A match in the current message always outranks one found only in recent context. */
    private const CURRENT = 10;
    private const CONTEXT = 5;

    /**
     * `$context` is the teammate's brief and recent user prompts: it keeps a service
     * the conversation is already about (a follow-up like "and yesterday's?") in scope,
     * but only ever below what the current message asks for.
     */
    public static function forTask(string $text, array $granted, int $limit, string $context = ''): array
    {
        $task = mb_strtolower($text);
        $earlier = mb_strtolower($context);
        $scored = [];
        $granted = array_values(array_unique(array_filter($granted, 'is_string')));
        foreach ($granted as $position => $slug) {
            $score = self::score($task, $slug, 100, 50, self::CURRENT);
            if ($score === 0 && $earlier !== '') $score = self::score($earlier, $slug, self::CONTEXT, self::CONTEXT, self::CONTEXT);
            if ($score > 0) $scored[] = [$slug, $score, $position];
        }
        usort($scored, fn ($a, $b) => $b[1] <=> $a[1] ?: $a[2] <=> $b[2]);
        $picked = array_column($scored, 0);
        // A message with no service clue of its own keeps the prior behavior, bounded to
        // the quote budget, with whatever the conversation points at placed first.
        // Explicit names can always bring later grants into scope.
        if (! array_filter($scored, fn ($row) => $row[1] >= self::CURRENT)) {
            $picked = [...$picked, ...array_diff($granted, $picked)];
        }
        return array_slice($picked, 0, $limit);
    }

    private static function score(string $text, string $slug, int $handle, int $named, int $term): int
    {
        $name = mb_strtolower((string) config('chat_connectors.catalogue.'.$slug.'.name', $slug));
        $score = self::mentions($text, '@'.$slug) ? $handle : 0;
        if (self::mentions($text, $name) || self::mentions($text, str_replace('_', ' ', $slug))) $score = max($score, $named);
        foreach (self::TERMS[$slug] ?? [] as $word) {
            if (self::mentions($text, $word)) $score = max($score, $term);
        }
        return $score;
    }

    private static function mentions(string $text, string $term): bool
    {
        return (bool) preg_match('/(?<![\pL\pN_])'.preg_quote($term, '/').'(?![\pL\pN_])/u', $text);
    }
}
