<?php

namespace App\Services\AI;

use InvalidArgumentException;

class TeamPlanProposalNormalizer
{
    public function __construct(
        private readonly StrictJsonDecoder $decoder,
        private readonly TeamPlanTopology $topology,
        private readonly TeamPlanAssignmentNormalizer $assignments,
        private readonly TeamPlanCriteriaNormalizer $criteria,
        private readonly TeamPlanValues $values,
    ) {}

    public function normalize(string $content, array $expectedRoles): array
    {
        $decoded = $this->decoder->decode(trim($content));
        if (! is_array($decoded) || array_is_list($decoded)) {
            throw new InvalidArgumentException('Team plan must be a JSON object.');
        }
        $this->values->assertKeys($decoded, [
            'schema_version', 'goal_summary', 'assumptions', 'non_goals',
            'assignments', 'acceptance_criteria', 'open_questions',
        ]);
        if (($decoded['schema_version'] ?? null) !== TeamPlanSchema::VERSION) {
            throw new InvalidArgumentException('Team plan schema version is unsupported.');
        }

        $roles = $this->topology->normalize($expectedRoles);
        $assignments = $this->assignments->normalize($decoded['assignments'] ?? null, $roles);
        $criteria = $this->criteria->normalize($decoded['acceptance_criteria'] ?? null);
        $this->assertCriteriaReferences($assignments, $criteria);

        return [
            'schemaVersion' => TeamPlanSchema::VERSION,
            'goalSummary' => $this->values->text($decoded['goal_summary'] ?? null, 1200),
            'assumptions' => $this->values->textList($decoded['assumptions'] ?? null),
            'nonGoals' => $this->values->textList($decoded['non_goals'] ?? null),
            'assignments' => $assignments,
            'acceptanceCriteria' => $criteria,
            'openQuestions' => $this->values->textList($decoded['open_questions'] ?? null, 1),
        ];
    }

    private function assertCriteriaReferences(array $assignments, array $criteria): void
    {
        $criterionKeys = array_column($criteria, 'key');
        $references = [];
        foreach ($assignments as $assignment) {
            foreach ($assignment['acceptanceCriteriaKeys'] as $key) {
                if (! in_array($key, $criterionKeys, true)) {
                    throw new InvalidArgumentException(
                        'Assignment references an unknown acceptance criterion.'
                    );
                }
                $references[$key] = true;
            }
        }
        if (count($references) !== count($criterionKeys)) {
            throw new InvalidArgumentException('Every acceptance criterion must be assigned.');
        }
    }
}
