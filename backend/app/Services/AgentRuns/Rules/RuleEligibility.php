<?php

namespace App\Services\AgentRuns\Rules;

/**
 * Which writes a standing rule may ever approve (roadmap Part 16). Only tools whose effect is small, named and recoverable are
 * listed. Anything that sends to people, publishes, deletes, spends or runs unknown code is never automatic: it is absent from
 * the list, and the name filter below stops a future tool with such a name from slipping in. Checked when a rule is made, when
 * an action is matched and again when it runs.
 */
final class RuleEligibility
{
    /** tool => the argument that scopes a rule to one repository, calendar, team or list (null: the connection is the scope). */
    private const BOUNDED = [
        'github_create_issue' => 'repository', 'github_comment_issue' => 'repository',
        'linear_create_issue' => 'teamId', 'notion_append_text' => 'pageId', 'notion_create_page' => 'parentPageId',
        'google_tasks_create' => 'listId', 'google_calendar_create_event' => 'calendarId',
        'workspace_edit' => 'path', 'linear_comment_issue' => 'issueId',
    ];
    private const NEVER = '/(^|_)(send|delete|trash|remove|destroy|pay|charge|refund|transfer|publish|submit|broadcast|post_message|invite|share|purge|revoke|merge|deploy)(_|$)/D';

    public static function allowed(string $tool): bool
    {
        return array_key_exists($tool, self::BOUNDED) && !preg_match(self::NEVER, $tool);
    }

    /** @return string[] */
    public static function tools(): array
    {
        return array_values(array_filter(array_keys(self::BOUNDED), [self::class, 'allowed']));
    }

    public static function takesScope(string $tool): bool
    {
        return (self::BOUNDED[$tool] ?? null) !== null;
    }

    /** The scope an action's arguments name, in the form a rule stores it ('' when the tool has none). */
    public static function scopeOf(string $tool, array $arguments): string
    {
        $key = self::BOUNDED[$tool] ?? null;
        return $key !== null && is_string($arguments[$key] ?? null) ? self::normalize($arguments[$key], $tool) : '';
    }

    public static function normalize(string $scope, string $tool = ''): string
    {
        $value = trim($scope);
        return str_starts_with($tool, 'github_') ? strtolower($value) : $value;
    }
}
