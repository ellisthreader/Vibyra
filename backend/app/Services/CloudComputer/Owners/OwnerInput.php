<?php
namespace App\Services\CloudComputer\Owners;

use App\Services\CloudComputer\Projects;

/** The shapes shared by the owner record and the activity feed: provider, conversation id, project and title. */
final class OwnerInput
{
    public const PROVIDERS = ['claude', 'codex', 'gemini'];
    /** The provider's own conversation id (a uuid or a short token); never a path. */
    public const ID = '/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/';

    public static function provider(string $v): bool
    {
        return in_array($v, self::PROVIDERS, true);
    }

    public static function id(string $v): bool
    {
        return preg_match(self::ID, $v) === 1;
    }

    /** The synced project name, the same shape the sync and clone routes accept. */
    public static function project(string $v): bool
    {
        return preg_match(Projects::NAME, $v) === 1;
    }

    /** One line, no control characters, at most $max characters; null when nothing is left. */
    public static function clip(mixed $v, int $max = 200): ?string
    {
        if (!is_string($v)) return null;
        $s = trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $v) ?? '');
        return $s === '' ? null : mb_substr($s, 0, $max);
    }
}
