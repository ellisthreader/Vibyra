<?php

namespace App\Services\AI;

use InvalidArgumentException;
use JsonException;

class StrictJsonStringParser
{
    public function parse(string $json, int &$offset, int $length): string
    {
        $start = $offset++;
        $escaped = false;

        while ($offset < $length) {
            $char = $json[$offset++];
            if ($escaped) {
                $this->consumeEscape($json, $offset, $char);
                $escaped = false;

                continue;
            }
            if ($char === '\\') {
                $escaped = true;

                continue;
            }
            if ($char === '"') {
                return $this->decode(substr($json, $start, $offset - $start));
            }
            if (ord($char) < 0x20) {
                throw new InvalidArgumentException('JSON string contains a control character.');
            }
        }

        throw new InvalidArgumentException('JSON string is unterminated.');
    }

    private function consumeEscape(string $json, int &$offset, string $char): void
    {
        if ($char !== 'u') {
            if (! str_contains('"\\/bfnrt', $char)) {
                throw new InvalidArgumentException('JSON string has an invalid escape.');
            }

            return;
        }

        for ($index = 0; $index < 4; $index++) {
            $hex = $json[$offset++] ?? '';
            if (! ctype_xdigit($hex)) {
                throw new InvalidArgumentException('JSON string has an invalid Unicode escape.');
            }
        }
    }

    private function decode(string $value): string
    {
        try {
            return json_decode($value, true, 2, JSON_THROW_ON_ERROR);
        } catch (JsonException $error) {
            throw new InvalidArgumentException('JSON string is invalid.', 0, $error);
        }
    }
}
