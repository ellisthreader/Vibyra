<?php
namespace App\Services\CloudWorkspaces\Git;

/**
 * Branch rules for the cloud computer's return path. The VM may only ever push
 * `vibyra/<task>`; the default branch and anything protected-looking is refused
 * regardless of prefix.
 */
final class Branches
{
    public const PREFIX = 'vibyra/';
    private const PROTECTED = ['main', 'master', 'default', 'trunk', 'develop', 'production', 'release'];
    public const REPO = '#\A(?!\.{1,2}/)[A-Za-z0-9_.-]{1,100}/(?!\.{1,2}\z)[A-Za-z0-9_.-]{1,100}\z#D';

    /** Git ref-name subset the rest of the connector uses. */
    public static function valid(string $branch): bool
    {
        if (strlen($branch) > 100 || !preg_match('#\A[A-Za-z0-9][A-Za-z0-9._/-]*\z#D', $branch)
            || str_contains($branch, '..') || str_contains($branch, '//') || str_ends_with($branch, '/') || str_ends_with($branch, '.')) return false;
        foreach (explode('/', $branch) as $part) {
            if (str_starts_with($part, '.') || str_ends_with($part, '.lock')) return false;
        }
        return true;
    }

    public static function isAgentBranch(string $branch): bool
    {
        return self::valid($branch) && str_starts_with($branch, self::PREFIX) && strlen($branch) > strlen(self::PREFIX);
    }

    public static function protectedLooking(string $branch): bool
    {
        return in_array(strtolower($branch), self::PROTECTED, true);
    }
}
