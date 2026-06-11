<?php

namespace App\Services\AI;

use InvalidArgumentException;

class TeamPlanAssignmentNormalizer
{
    public function __construct(
        private readonly TeamPlanValues $values,
        private readonly TeamPlanScopeNormalizer $scopes,
    ) {}

    public function normalize(mixed $raw, array $expectedRoles): array
    {
        if (! is_array($raw) || ! array_is_list($raw) || count($raw) !== count($expectedRoles)) {
            throw new InvalidArgumentException('assignments must match the requested roles.');
        }

        $byRole = [];
        foreach ($raw as $item) {
            $assignment = $this->assignment($item, $expectedRoles, array_keys($byRole));
            $byRole[$assignment['roleKey']] = $assignment;
        }
        if (array_diff($expectedRoles, array_keys($byRole)) !== []) {
            throw new InvalidArgumentException('Assignments omitted a requested role.');
        }

        return array_map(fn ($role) => $byRole[$role], $expectedRoles);
    }

    private function assignment(mixed $item, array $expectedRoles, array $seenRoles): array
    {
        if (! is_array($item) || array_is_list($item)) {
            throw new InvalidArgumentException('Each assignment must be an object.');
        }
        $this->values->assertKeys($item, [
            'role_key', 'objective', 'deliverables', 'assumptions', 'non_goals',
            'focus_areas', 'inspect_scope', 'write_scope',
            'acceptance_criteria_keys', 'validation_intents', 'risks',
            'completion_evidence',
        ]);
        $role = strtolower($this->values->text($item['role_key'] ?? null, 32));
        if (! in_array($role, $expectedRoles, true) || in_array($role, $seenRoles, true)) {
            throw new InvalidArgumentException('Assignments changed or duplicated the requested roles.');
        }
        $writeScope = $this->scopes->normalize($item['write_scope'] ?? null);
        if ($role !== 'builder' && $writeScope !== []) {
            throw new InvalidArgumentException('Only the Builder may receive write scope.');
        }

        return [
            'roleKey' => $role,
            'objective' => $this->values->text($item['objective'] ?? null, 1200),
            'deliverables' => $this->values->textList($item['deliverables'] ?? null),
            'assumptions' => $this->values->textList($item['assumptions'] ?? null),
            'nonGoals' => $this->values->textList($item['non_goals'] ?? null),
            'focusAreas' => $this->values->textList($item['focus_areas'] ?? null),
            'inspectScope' => $this->scopes->normalize($item['inspect_scope'] ?? null),
            'writeScope' => $writeScope,
            'acceptanceCriteriaKeys' => $this->values->keyList(
                $item['acceptance_criteria_keys'] ?? null
            ),
            'validationIntents' => $this->validationIntents($item['validation_intents'] ?? null),
            'risks' => $this->values->textList($item['risks'] ?? null),
            'completionEvidence' => $this->values->textList($item['completion_evidence'] ?? null),
        ];
    }

    private function validationIntents(mixed $raw): array
    {
        if (! is_array($raw) || ! array_is_list($raw) || count($raw) > TeamPlanValues::ITEM_LIMIT) {
            throw new InvalidArgumentException('validation_intents must be a bounded list.');
        }
        $allowed = ['inspect', 'reproduce', 'test', 'lint', 'typecheck', 'build'];

        return array_map(function ($item) use ($allowed) {
            if (! is_array($item) || array_is_list($item)) {
                throw new InvalidArgumentException('Each validation intent must be an object.');
            }
            $this->values->assertKeys($item, ['kind', 'target']);
            $kind = $this->values->text($item['kind'] ?? null, 20);
            if (! in_array($kind, $allowed, true)) {
                throw new InvalidArgumentException('Validation intent kind is unsupported.');
            }

            return [
                'kind' => $kind,
                'target' => $this->values->text($item['target'] ?? null, 1200),
            ];
        }, $raw);
    }
}
