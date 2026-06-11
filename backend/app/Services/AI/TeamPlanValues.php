<?php

namespace App\Services\AI;

use InvalidArgumentException;

class TeamPlanValues
{
    public const ITEM_LIMIT = 12;

    public function text(mixed $value, int $maxLength): string
    {
        if (! is_string($value)) {
            throw new InvalidArgumentException('Expected a string value.');
        }
        $text = trim(preg_replace('/\s+/u', ' ', $value) ?: '');
        if ($text === '' || mb_strlen($text) > $maxLength) {
            throw new InvalidArgumentException('String value is empty or exceeds its limit.');
        }

        return $text;
    }

    public function textList(mixed $raw, int $limit = self::ITEM_LIMIT): array
    {
        if (! is_array($raw) || ! array_is_list($raw) || count($raw) > $limit) {
            throw new InvalidArgumentException('Expected a bounded string list.');
        }
        $items = array_map(fn ($item) => $this->text($item, 1200), $raw);
        if (count(array_unique($items)) !== count($items)) {
            throw new InvalidArgumentException('String lists must not contain duplicates.');
        }

        return $items;
    }

    public function keyList(mixed $raw): array
    {
        if (! is_array($raw) || ! array_is_list($raw) || count($raw) > 12) {
            throw new InvalidArgumentException('Acceptance criterion references must be a bounded list.');
        }
        $keys = array_map(fn ($item) => $this->key($item), $raw);
        if (count(array_unique($keys)) !== count($keys)) {
            throw new InvalidArgumentException('Acceptance criterion references must be unique.');
        }

        return $keys;
    }

    public function key(mixed $value): string
    {
        $key = strtolower($this->text($value, 80));
        if (! preg_match('/^[a-z0-9][a-z0-9._-]*$/', $key)) {
            throw new InvalidArgumentException('Acceptance criterion key is invalid.');
        }

        return $key;
    }

    public function assertKeys(array $value, array $expected): void
    {
        $actual = array_keys($value);
        sort($actual);
        sort($expected);
        if ($actual !== $expected) {
            throw new InvalidArgumentException('Team plan contains missing or unknown properties.');
        }
    }
}
