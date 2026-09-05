<?php

namespace App\Services\SessionState;

use InvalidArgumentException;
use RuntimeException;

final class StateDelta
{
    public static function apply(array $document, array $changes): array
    {
        if (! array_is_list($changes) || count($changes) > 256) {
            throw new InvalidArgumentException('Invalid state change batch.');
        }
        foreach ($changes as $change) {
            self::validate($change);
            $path = $change['path'];
            $key = array_pop($path);
            $parent = &$document;
            foreach ($path as $part) {
                if (! is_array($parent) || ! array_key_exists($part, $parent) || ! is_array($parent[$part])) {
                    throw new RuntimeException('State changed on another client.');
                }
                $parent = &$parent[$part];
            }
            $exists = array_key_exists($key, $parent);
            $current = $exists ? $parent[$key] : null;
            // An acknowledged write may have lost its HTTP response. Replays
            // are no-ops when the requested result is already present.
            $alreadyApplied = $change['remove'] ? ! $exists
                : ($exists && self::equal($current, $change['value']));
            if (! $alreadyApplied) {
                if ($exists !== $change['beforePresent'] || ($exists && ! self::equal($current, $change['before']))) {
                    throw new RuntimeException('State changed on another client.');
                }
                if ($change['remove']) unset($parent[$key]);
                else $parent[$key] = $change['value'];
            }
            unset($parent);
        }
        return $document;
    }

    private static function validate(mixed $change): void
    {
        $path = is_array($change) ? ($change['path'] ?? null) : null;
        if (! is_array($path) || ! array_is_list($path) || count($path) < 1 || count($path) > 16
            || ! in_array($path[0], ['appState', 'onboardingComplete', 'rememberedDesktops'], true)
            || ! is_bool($change['beforePresent'] ?? null) || ! is_bool($change['remove'] ?? null)
            || ($change['beforePresent'] && ! array_key_exists('before', $change))
            || (! $change['remove'] && ! array_key_exists('value', $change))
            || ($change['remove'] && count($path) === 1)) {
            throw new InvalidArgumentException('Invalid state change.');
        }
        foreach ($path as $part) {
            if (! is_string($part) || strlen($part) > 200 || in_array($part, ['__proto__', 'prototype', 'constructor'], true)) {
                throw new InvalidArgumentException('Invalid state path.');
            }
        }
    }

    private static function equal(mixed $left, mixed $right): bool
    {
        if (! is_array($left) || ! is_array($right)) return $left === $right;
        if (count($left) !== count($right)) return false;
        foreach ($left as $key => $value) {
            if (! array_key_exists($key, $right) || ! self::equal($value, $right[$key])) return false;
        }
        return true;
    }
}
