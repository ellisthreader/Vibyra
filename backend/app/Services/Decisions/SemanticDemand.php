<?php
namespace App\Services\Decisions;
use App\Services\Vibes\Auto\Demand;
final class SemanticDemand
{
    public static function apply(Demand $local, ?array $result): Demand
    {
        if (!$result) return $local;
        $answers = $result['answers'] ?? [];
        foreach (['capability','deliberation','specialty'] as $key) {
            if (($answers[$key]['confidence'] ?? 0) < config('intelligence.confidence') || ($answers[$key]['choice'] ?? 'unknown') === 'unknown') return $local;
        }
        $capability = ['routine' => 0.1, 'moderate' => 0.5, 'demanding' => 0.95][$answers['capability']['choice']] ?? null;
        $deliberation = ['minimal' => 0.05, 'some' => 0.5, 'substantial' => 0.95][$answers['deliberation']['choice']] ?? null;
        if ($capability === null || $deliberation === null) return $local;
        // Initial pilot only raises semantic demand. Never remove local structural evidence.
        return $local->withSemantic($capability, $deliberation, $answers['specialty']['choice']);
    }
}
