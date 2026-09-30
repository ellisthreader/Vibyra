<?php

namespace App\Services\Agents;

/** Picks a bounded set of a teammate's existing grants for this task's quote. */
final class ConnectorSelection
{
    private const TERMS = [
        'github' => ['repo', 'repository', 'pull request', 'pr', 'commit', 'github'],
        'stripe' => ['payment', 'payments', 'revenue', 'refund', 'balance', 'customer', 'stripe'],
        'figma' => ['design', 'frame', 'mockup', 'figma'],
        'gmail' => ['email', 'emails', 'mail', 'inbox', 'gmail'],
        'google_calendar' => ['calendar', 'meeting', 'meetings', 'event', 'events', 'schedule'],
        'google_drive' => ['drive', 'document', 'documents', 'doc', 'sheet', 'slide', 'file', 'files'],
        'outlook_mail' => ['email', 'emails', 'mail', 'inbox', 'outlook'],
        'outlook_calendar' => ['calendar', 'meeting', 'meetings', 'event', 'events', 'schedule', 'outlook'],
        'onedrive' => ['onedrive', 'document', 'documents', 'file', 'files', 'microsoft file'],
        'teams' => ['teams', 'chat', 'chats', 'workplace message'],
        'sharepoint' => ['sharepoint', 'site', 'sites', 'document', 'documents', 'file', 'files'],
        'google_tasks' => ['task', 'tasks', 'todo', 'to-do', 'checklist'],
        'deepwiki' => ['deepwiki', 'documentation', 'docs', 'repository docs', 'codebase question'],
        'slack' => ['slack', 'channel', 'workspace message'],
        'notion' => ['notion', 'page', 'notes'],
        'linear' => ['linear', 'issue', 'issues', 'ticket', 'tickets', 'sprint'],
    ];

    public static function forTask(string $text, array $granted, int $limit): array
    {
        $task = mb_strtolower($text);
        $scored = [];
        foreach (array_values(array_unique(array_filter($granted, 'is_string'))) as $position => $slug) {
            $name = mb_strtolower((string) config('chat_connectors.catalogue.'.$slug.'.name', $slug));
            $label = str_replace('_', ' ', $slug);
            $score = self::mentions($task, '@'.$slug) ? 100 : 0;
            if (self::mentions($task, $name) || self::mentions($task, $label)) $score = max($score, 50);
            foreach (self::TERMS[$slug] ?? [] as $term) {
                if (self::mentions($task, $term)) $score = max($score, 10);
            }
            if ($score > 0) $scored[] = [$slug, $score, $position];
        }
        usort($scored, fn ($a, $b) => $b[1] <=> $a[1] ?: $a[2] <=> $b[2]);
        $picked = array_column(array_slice($scored, 0, $limit), 0);
        // A task with no service clue retains the prior behavior, bounded to the
        // quote budget. Explicit names can always bring later grants into scope.
        return $picked !== [] ? $picked : array_slice($granted, 0, $limit);
    }

    private static function mentions(string $text, string $term): bool
    {
        return (bool) preg_match('/(?<![\pL\pN_])'.preg_quote($term, '/').'(?![\pL\pN_])/u', $text);
    }
}
