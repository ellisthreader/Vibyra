<?php

namespace App\Services\AgentTriggers;

/**
 * Linear `Issue` webhook → saved filter → bounded summary. Filter: `team` (key or id), `labels` (any-of names),
 * `actions` (created | updated | assigned), `assignee` ("me" = the connected Linear account, or a user id),
 * `includeOwn`. An update that sets a new assignee counts as both `updated` and `assigned`.
 */
final class LinearEvents
{
    private const ACTIONS = ['created', 'updated', 'assigned'];

    public static function filter(array $f): array
    {
        $actions = TriggerKinds::list($f, 'actions', '/^[a-z]{5,20}$/D') ?: ['created'];
        if (array_diff($actions, self::ACTIONS)) TriggerKinds::fail('filter.actions', 'Use created, updated or assigned.');
        $assignee = TriggerKinds::optional($f, 'assignee', '/^(me|[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})$/D',
            'Use "me" or a Linear user id.');
        return array_filter(['team' => TriggerKinds::optional($f, 'team', '/^[A-Za-z0-9_-]{1,40}$/D', 'Use a team key like ENG.'),
            'actions' => $actions, 'labels' => TriggerKinds::list($f, 'labels', '/^.{1,50}$/uD') ?: null, 'assignee' => $assignee,
            'includeOwn' => ($f['includeOwn'] ?? false) === true ? true : null], fn ($v) => $v !== null);
    }

    /**
     * @param string[] $me lowercase id prefixes of the connected Linear account (for assignee "me")
     * @return ?array [type, summary, subject, actor ids]
     */
    public static function match(array $body, array $filter, array $me): ?array
    {
        $data = $body['data'] ?? null;
        $action = (string) ($body['action'] ?? '');
        if (($body['type'] ?? '') !== 'Issue' || !is_array($data) || !is_string($data['id'] ?? null) || !in_array($action, ['create', 'update'], true)) return null;
        $assignee = is_string($data['assigneeId'] ?? null) ? strtolower($data['assigneeId']) : null;
        $classes = $action === 'create' ? ['created'] : ['updated'];
        if ($assignee !== null && ($action === 'create' || array_key_exists('assigneeId', (array) ($body['updatedFrom'] ?? [])))) $classes[] = 'assigned';
        if (!array_intersect($filter['actions'] ?? ['created'], $classes)) return null;
        $team = is_array($data['team'] ?? null) ? $data['team'] : [];
        if (isset($filter['team']) && !in_array(strtolower($filter['team']), array_map('strtolower', array_filter([$team['key'] ?? null,
            $team['id'] ?? null, $data['teamId'] ?? null], 'is_string')), true)) return null;
        $labels = array_values(array_filter(array_map(fn ($l) => is_array($l) ? ($l['name'] ?? null) : null, $data['labels'] ?? []), 'is_string'));
        if (!empty($filter['labels']) && !array_intersect($filter['labels'], $labels)) return null;
        if (isset($filter['assignee']) && !self::assignedTo($assignee, strtolower($filter['assignee']), $me)) return null;
        $actor = is_array($body['actor'] ?? null) ? $body['actor'] : [];
        $who = is_array($data['assignee'] ?? null) ? $data['assignee'] : [];
        $text = fn ($v, int $max) => TriggerKinds::text($v, $max);
        return ['Issue.'.$action, ['action' => $action, 'classes' => $classes, 'identifier' => $text($data['identifier'] ?? '', 40),
            'title' => $text($data['title'] ?? '', 300), 'description' => $text($data['description'] ?? '', 4000),
            'team' => $text($team['key'] ?? ($team['name'] ?? ''), 80), 'state' => $text($data['state']['name'] ?? '', 80),
            'priority' => $text($data['priorityLabel'] ?? '', 40), 'assignee' => $text($who['name'] ?? '', 100),
            'labels' => array_slice($labels, 0, 20), 'by' => $text($actor['name'] ?? '', 100),
            'url' => $text($data['url'] ?? ($body['url'] ?? ''), 500)],
            'linear:'.$data['id'], is_string($actor['id'] ?? null) ? [strtolower($actor['id'])] : []];
    }

    private static function assignedTo(?string $assignee, string $want, array $me): bool
    {
        if ($assignee === null) return false;
        if ($want !== 'me') return $assignee === $want;
        foreach ($me as $id) if ($id !== '' && str_starts_with($assignee, $id)) return true;
        return false;
    }
}
