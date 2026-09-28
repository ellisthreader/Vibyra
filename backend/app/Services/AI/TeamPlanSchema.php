<?php

namespace App\Services\AI;

class TeamPlanSchema
{
    public const VERSION = 'vibyra.team-plan.v1';

    public const ROLES = ['coordinator', 'builder', 'verifier', 'reviewer'];

    public function __construct(
        private readonly TeamPlanOutputSchema $outputSchema,
        private readonly TeamPlanProposalNormalizer $proposalNormalizer,
        private readonly TeamPlanTopology $topology,
    ) {}

    public function outputSchema(): array
    {
        return $this->outputSchema->build();
    }

    public function normalize(string $content, array $expectedRoles): array
    {
        return $this->proposalNormalizer->normalize($content, $expectedRoles);
    }

    public function normalizeRoles(mixed $roles): array
    {
        return $this->topology->normalize($roles);
    }
}
