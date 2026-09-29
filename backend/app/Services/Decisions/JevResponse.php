<?php

namespace App\Services\Decisions;

/** Validate provider data before any answer can influence a launch. */
final class JevResponse
{
    public static function usage(mixed $cost): ?int
    {
        if (!is_numeric($cost) || !is_finite((float) $cost) || $cost < 0 || $cost >= PHP_INT_MAX / 1000000) {
            return null;
        }

        return (int) ceil((float) $cost * 1000000);
    }

    public static function parse(mixed $body, array $questions): array
    {
        if (!is_array($body) || ($body['model'] ?? null) !== config('intelligence.jev_served_model')) {
            throw new \UnexpectedValueException('model_version');
        }
        $answers = [];
        foreach ($questions as $id => $question) {
            $answer = $body['answers'][$id] ?? null;
            $choice = is_array($answer) ? ($answer['choice'] ?? null) : null;
            if (!is_string($choice) || ($answer['type'] ?? null) !== 'choice' || !isset($question['criteria'][$choice])) {
                throw new \UnexpectedValueException('invalid_answer');
            }
            $confidence = $answer['confidence'] ?? null;
            $probabilities = $answer['probabilities'] ?? null;
            if (!self::probability($confidence) || !is_array($probabilities)) {
                throw new \UnexpectedValueException('invalid_confidence');
            }
            $keys = array_keys($question['criteria']);
            if (array_diff(array_keys($probabilities), $keys) || array_diff($keys, array_keys($probabilities))) {
                throw new \UnexpectedValueException('invalid_probabilities');
            }
            foreach ($probabilities as $value) {
                if (!self::probability($value)) throw new \UnexpectedValueException('invalid_probability');
            }
            if (abs(array_sum($probabilities) - 1) > 0.02) {
                throw new \UnexpectedValueException('invalid_distribution');
            }
            $answers[$id] = ['choice' => $choice, 'confidence' => (float) $confidence, 'probabilities' => $probabilities];
        }
        if (self::usage($body['usage']['cost'] ?? null) === null) {
            throw new \UnexpectedValueException('usage_unknown');
        }

        return ['answers' => $answers, 'model' => $body['model'], 'cost' => (float) $body['usage']['cost']];
    }

    private static function probability(mixed $value): bool
    {
        return is_numeric($value) && is_finite((float) $value) && $value >= 0 && $value <= 1;
    }
}
