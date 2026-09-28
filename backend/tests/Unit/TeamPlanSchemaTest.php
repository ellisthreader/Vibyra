<?php

namespace Tests\Unit;

use App\Services\AI\StrictJsonDecoder;
use App\Services\AI\TeamPlanSchema;
use InvalidArgumentException;
use Tests\TestCase;

class TeamPlanSchemaTest extends TestCase
{
    public function test_strict_decoder_rejects_duplicate_keys_and_trailing_content(): void
    {
        $decoder = new StrictJsonDecoder;

        foreach ([
            '{"schema_version":"v1","schema_version":"v2"}',
            '{"schema_version":"v1"} trailing',
        ] as $json) {
            try {
                $decoder->decode($json);
                $this->fail('Expected strict JSON decoding to fail.');
            } catch (InvalidArgumentException) {
                $this->assertTrue(true);
            }
        }
    }

    public function test_schema_rejects_unsafe_scope_paths(): void
    {
        $plan = [
            'schema_version' => TeamPlanSchema::VERSION,
            'goal_summary' => 'Implement a focused change.',
            'assumptions' => [],
            'non_goals' => [],
            'assignments' => [
                $this->assignment('builder', '../.env'),
                $this->assignment('reviewer'),
            ],
            'acceptance_criteria' => [[
                'key' => 'done',
                'statement' => 'The change is verified.',
                'evidence_required' => 'review_finding',
            ]],
            'open_questions' => [],
        ];

        $this->expectException(InvalidArgumentException::class);
        app(TeamPlanSchema::class)->normalize(
            json_encode($plan, JSON_THROW_ON_ERROR),
            ['builder', 'reviewer']
        );
    }

    private function assignment(string $role, ?string $writePath = null): array
    {
        return [
            'role_key' => $role,
            'objective' => 'Complete the bounded role.',
            'deliverables' => [],
            'assumptions' => [],
            'non_goals' => [],
            'focus_areas' => [],
            'inspect_scope' => [],
            'write_scope' => $writePath === null ? [] : [[
                'kind' => 'file',
                'path' => $writePath,
            ]],
            'acceptance_criteria_keys' => ['done'],
            'validation_intents' => [],
            'risks' => [],
            'completion_evidence' => [],
        ];
    }
}
