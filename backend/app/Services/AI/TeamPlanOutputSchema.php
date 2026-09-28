<?php

namespace App\Services\AI;

class TeamPlanOutputSchema
{
    private const ITEM_LIMIT = 12;

    public function build(): array
    {
        $stringArray = $this->stringArray();
        $scopeArray = $this->scopeArray();

        return [
            'type' => 'object',
            'additionalProperties' => false,
            'properties' => [
                'schema_version' => ['type' => 'string', 'const' => TeamPlanSchema::VERSION],
                'goal_summary' => ['type' => 'string', 'maxLength' => 1200],
                'assumptions' => $stringArray,
                'non_goals' => $stringArray,
                'assignments' => [
                    'type' => 'array',
                    'minItems' => 2,
                    'maxItems' => 4,
                    'items' => $this->assignment($stringArray, $scopeArray),
                ],
                'acceptance_criteria' => [
                    'type' => 'array',
                    'minItems' => 1,
                    'maxItems' => 12,
                    'items' => $this->acceptanceCriterion(),
                ],
                'open_questions' => [
                    'type' => 'array',
                    'maxItems' => 1,
                    'items' => ['type' => 'string', 'maxLength' => 1200],
                ],
            ],
            'required' => [
                'schema_version', 'goal_summary', 'assumptions', 'non_goals',
                'assignments', 'acceptance_criteria', 'open_questions',
            ],
        ];
    }

    private function assignment(array $stringArray, array $scopeArray): array
    {
        return [
            'type' => 'object',
            'additionalProperties' => false,
            'properties' => [
                'role_key' => ['type' => 'string', 'enum' => TeamPlanSchema::ROLES],
                'objective' => ['type' => 'string', 'maxLength' => 1200],
                'deliverables' => $stringArray,
                'assumptions' => $stringArray,
                'non_goals' => $stringArray,
                'focus_areas' => $stringArray,
                'inspect_scope' => $scopeArray,
                'write_scope' => $scopeArray,
                'acceptance_criteria_keys' => [
                    'type' => 'array',
                    'maxItems' => 12,
                    'items' => ['type' => 'string', 'maxLength' => 80],
                ],
                'validation_intents' => [
                    'type' => 'array',
                    'maxItems' => self::ITEM_LIMIT,
                    'items' => [
                        'type' => 'object',
                        'additionalProperties' => false,
                        'properties' => [
                            'kind' => [
                                'type' => 'string',
                                'enum' => ['inspect', 'reproduce', 'test', 'lint', 'typecheck', 'build'],
                            ],
                            'target' => ['type' => 'string', 'maxLength' => 1200],
                        ],
                        'required' => ['kind', 'target'],
                    ],
                ],
                'risks' => $stringArray,
                'completion_evidence' => $stringArray,
            ],
            'required' => [
                'role_key', 'objective', 'deliverables', 'assumptions', 'non_goals',
                'focus_areas', 'inspect_scope', 'write_scope',
                'acceptance_criteria_keys', 'validation_intents', 'risks',
                'completion_evidence',
            ],
        ];
    }

    private function acceptanceCriterion(): array
    {
        return [
            'type' => 'object',
            'additionalProperties' => false,
            'properties' => [
                'key' => ['type' => 'string', 'maxLength' => 80],
                'statement' => ['type' => 'string', 'maxLength' => 1200],
                'evidence_required' => [
                    'type' => 'string',
                    'enum' => [
                        'repository_evidence', 'diff', 'command_result',
                        'runtime_observation', 'review_finding',
                    ],
                ],
            ],
            'required' => ['key', 'statement', 'evidence_required'],
        ];
    }

    private function stringArray(): array
    {
        return [
            'type' => 'array',
            'maxItems' => self::ITEM_LIMIT,
            'items' => ['type' => 'string', 'maxLength' => 1200],
        ];
    }

    private function scopeArray(): array
    {
        return [
            'type' => 'array',
            'maxItems' => 24,
            'items' => [
                'type' => 'object',
                'additionalProperties' => false,
                'properties' => [
                    'kind' => ['type' => 'string', 'enum' => ['file', 'directory']],
                    'path' => ['type' => 'string', 'maxLength' => 300],
                ],
                'required' => ['kind', 'path'],
            ],
        ];
    }
}
