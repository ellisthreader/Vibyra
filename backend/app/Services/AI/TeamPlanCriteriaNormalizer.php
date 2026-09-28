<?php

namespace App\Services\AI;

use InvalidArgumentException;

class TeamPlanCriteriaNormalizer
{
    private const EVIDENCE = [
        'repository_evidence', 'diff', 'command_result',
        'runtime_observation', 'review_finding',
    ];

    public function __construct(private readonly TeamPlanValues $values) {}

    public function normalize(mixed $raw): array
    {
        if (! is_array($raw) || ! array_is_list($raw) || $raw === [] || count($raw) > 12) {
            throw new InvalidArgumentException('acceptance_criteria must contain one to twelve items.');
        }

        $criteria = [];
        $seen = [];
        foreach ($raw as $item) {
            $criterion = $this->criterion($item);
            if (isset($seen[$criterion['key']])) {
                throw new InvalidArgumentException('Acceptance criterion keys must be unique.');
            }
            $seen[$criterion['key']] = true;
            $criteria[] = $criterion;
        }

        return $criteria;
    }

    private function criterion(mixed $item): array
    {
        if (! is_array($item) || array_is_list($item)) {
            throw new InvalidArgumentException('Each acceptance criterion must be an object.');
        }
        $this->values->assertKeys($item, ['key', 'statement', 'evidence_required']);
        $evidence = $this->values->text($item['evidence_required'] ?? null, 40);
        if (! in_array($evidence, self::EVIDENCE, true)) {
            throw new InvalidArgumentException('Acceptance criterion evidence type is unsupported.');
        }

        return [
            'key' => $this->values->key($item['key'] ?? null),
            'statement' => $this->values->text($item['statement'] ?? null, 1200),
            'evidenceRequired' => $evidence,
        ];
    }
}
