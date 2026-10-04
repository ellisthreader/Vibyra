<?php

namespace App\Services\Platform;

use App\Models\AccountAuditEvent;
use App\Models\User;
use Throwable;

/**
 * The account's own activity log (roadmap Part 11), generalising the RemoteAuditEvent pattern: append-only, metadata only,
 * read-only to the person. Anything that changes who or what can act for the account calls
 * `AccountActivity::record($userId, 'spend_cap.changed', ['day' => 25])`. It never throws and does nothing while
 * PLATFORM_ACTIVITY_ENABLED is off, so a call site can never break the action it describes.
 */
final class AccountActivity
{
    private const TITLES = [
        'sign_in' => 'Signed in', 'device.trusted' => 'Trusted a device', 'device.denied' => 'Refused a device',
        'device.revoked' => 'Removed a trusted device', 'api_key.created' => 'Created an API key', 'api_key.revoked' => 'Revoked an API key',
        'webhook.created' => 'Added a webhook', 'webhook.deleted' => 'Removed a webhook', 'webhook.paused' => 'A webhook was paused',
        'webhook.resumed' => 'Resumed a webhook', 'mcp_server.added' => 'Added an MCP server', 'grant.changed' => 'Changed what a teammate may use',
        'grant.revoked' => 'Took back access from a teammate', 'spend_cap.changed' => 'Changed a spending limit',
    ];
    private const HIDDEN = '/secret|token|passw|credential|hash|signature|authoriz|cookie/i';

    /** @param string $actor account (a person, signed in) | system */
    public static function record(int|User $user, string $event, array $detail = [], string $actor = 'account'): void
    {
        if (!config('platform.activity') || !preg_match('/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)?$/D', $event) || strlen($event) > 60) return;
        try {
            $request = $actor === 'account' && app()->bound('request') ? request() : null;
            AccountAuditEvent::query()->create(['user_id' => $user instanceof User ? $user->id : $user, 'event' => $event,
                'actor' => $actor === 'system' ? 'system' : 'account', 'detail' => self::clean($detail) ?: null,
                'ip_address' => $request?->ip(), 'created_at' => now()]);
        } catch (Throwable $e) {
            report($e);
        }
    }

    /** @return array{items: array, next: ?int} newest first; `before` is the last id of the previous page */
    public static function list(int $userId, int $limit = 30, ?int $before = null): array
    {
        $limit = max(1, min(100, $limit));
        $rows = AccountAuditEvent::query()->where('user_id', $userId)->when($before, fn ($q) => $q->where('id', '<', $before))
            ->orderByDesc('id')->limit($limit + 1)->get();
        $page = $rows->take($limit);
        return ['items' => $page->map(fn (AccountAuditEvent $e) => ['id' => $e->id, 'event' => $e->event,
            'title' => self::TITLES[$e->event] ?? ucfirst(str_replace(['.', '_'], ' ', $e->event)), 'detail' => (object) ($e->detail ?? []),
            'actor' => $e->actor, 'createdAt' => $e->created_at?->toIso8601String()])->all(),
            'next' => $rows->count() > $limit ? $page->last()->id : null];
    }

    /** Short scalars under plain keys, nothing that looks like a credential, never nested content. */
    private static function clean(array $detail): array
    {
        $out = [];
        foreach ($detail as $key => $value) {
            if (count($out) >= 12) break;
            if (!is_string($key) || !preg_match('/^[a-z][A-Za-z0-9_]{0,31}$/D', $key) || preg_match(self::HIDDEN, $key)) continue;
            if (is_array($value) && array_is_list($value)) $value = implode(', ', array_filter(array_slice($value, 0, 10), 'is_scalar'));
            if (is_bool($value) || is_int($value) || is_float($value)) $out[$key] = $value;
            elseif (is_string($value)) $out[$key] = mb_substr(preg_replace('/[\x00-\x1f\x7f]/u', '', $value) ?? '', 0, 120);
        }
        return $out;
    }
}
