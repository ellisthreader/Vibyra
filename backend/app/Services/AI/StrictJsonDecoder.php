<?php

namespace App\Services\AI;

use InvalidArgumentException;
use JsonException;

class StrictJsonDecoder
{
    private int $offset = 0;

    private int $length = 0;

    private string $json = '';

    public function __construct(private ?StrictJsonStringParser $strings = null) {}

    public function decode(string $json, int $maxBytes = 65536, int $maxDepth = 8): mixed
    {
        if (strlen($json) > $maxBytes) {
            throw new InvalidArgumentException('JSON response exceeds the byte limit.');
        }
        if (! mb_check_encoding($json, 'UTF-8')) {
            throw new InvalidArgumentException('JSON response contains invalid UTF-8.');
        }

        $this->json = $json;
        $this->length = strlen($json);
        $this->offset = 0;
        $value = $this->parseValue(0, $maxDepth);
        $this->skipWhitespace();
        if ($this->offset !== $this->length) {
            throw new InvalidArgumentException('JSON response contains trailing content.');
        }

        return $value;
    }

    private function parseValue(int $depth, int $maxDepth): mixed
    {
        if ($depth > $maxDepth) {
            throw new InvalidArgumentException('JSON response exceeds the depth limit.');
        }

        $this->skipWhitespace();
        $char = $this->json[$this->offset] ?? null;

        return match ($char) {
            '{' => $this->parseObject($depth + 1, $maxDepth),
            '[' => $this->parseArray($depth + 1, $maxDepth),
            '"' => $this->parseString(),
            't' => $this->parseLiteral('true', true),
            'f' => $this->parseLiteral('false', false),
            'n' => $this->parseLiteral('null', null),
            default => $this->parseNumber(),
        };
    }

    private function parseObject(int $depth, int $maxDepth): array
    {
        $this->offset++;
        $result = [];
        $keys = [];
        $this->skipWhitespace();
        if (($this->json[$this->offset] ?? null) === '}') {
            $this->offset++;

            return $result;
        }

        while (true) {
            $this->skipWhitespace();
            if (($this->json[$this->offset] ?? null) !== '"') {
                throw new InvalidArgumentException('JSON object keys must be strings.');
            }
            $key = $this->parseString();
            if (isset($keys[$key])) {
                throw new InvalidArgumentException('JSON response contains duplicate object keys.');
            }
            $keys[$key] = true;
            $this->skipWhitespace();
            $this->consume(':');
            $result[$key] = $this->parseValue($depth, $maxDepth);
            $this->skipWhitespace();
            $separator = $this->json[$this->offset] ?? null;
            if ($separator === '}') {
                $this->offset++;

                return $result;
            }
            $this->consume(',');
        }
    }

    private function parseArray(int $depth, int $maxDepth): array
    {
        $this->offset++;
        $result = [];
        $this->skipWhitespace();
        if (($this->json[$this->offset] ?? null) === ']') {
            $this->offset++;

            return $result;
        }

        while (true) {
            $result[] = $this->parseValue($depth, $maxDepth);
            $this->skipWhitespace();
            $separator = $this->json[$this->offset] ?? null;
            if ($separator === ']') {
                $this->offset++;

                return $result;
            }
            $this->consume(',');
        }
    }

    private function parseString(): string
    {
        $this->strings ??= new StrictJsonStringParser;

        return $this->strings->parse($this->json, $this->offset, $this->length);
    }

    private function parseNumber(): int|float
    {
        if (! preg_match('/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/', substr($this->json, $this->offset), $match)) {
            throw new InvalidArgumentException('JSON value is invalid.');
        }

        $this->offset += strlen($match[0]);
        try {
            return json_decode($match[0], true, 2, JSON_THROW_ON_ERROR);
        } catch (JsonException $error) {
            throw new InvalidArgumentException('JSON number is invalid.', 0, $error);
        }
    }

    private function parseLiteral(string $literal, mixed $value): mixed
    {
        if (substr($this->json, $this->offset, strlen($literal)) !== $literal) {
            throw new InvalidArgumentException('JSON literal is invalid.');
        }
        $this->offset += strlen($literal);

        return $value;
    }

    private function skipWhitespace(): void
    {
        while (
            $this->offset < $this->length
            && str_contains(" \t\n\r", $this->json[$this->offset])
        ) {
            $this->offset++;
        }
    }

    private function consume(string $expected): void
    {
        if (($this->json[$this->offset] ?? null) !== $expected) {
            throw new InvalidArgumentException("Expected '{$expected}' in JSON response.");
        }
        $this->offset++;
    }
}
