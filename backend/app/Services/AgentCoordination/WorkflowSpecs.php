<?php
namespace App\Services\AgentCoordination;
use App\Services\AgentRuns\Tools\Providers\Schema;
use App\Services\AgentWork\Specs;
use Illuminate\Support\Facades\Validator;
final class WorkflowSpecs
{
    public static function normalize(array $spec): array
    {
        Schema::only($spec, ['agentId', 'runtimeId', 'title', 'expiresAt', 'steps', 'finalCriteria', 'groupId', 'groupRevision', 'messageId', 'prompt', 'mentions', 'sharedContext']);
        $source = Validator::make($spec, ['groupId' => 'required|uuid', 'groupRevision' => 'required|integer|min:1', 'messageId' => 'required|uuid',
            'prompt' => 'required|string|max:4000', 'mentions' => 'present|array|max:8', 'mentions.*' => 'required|uuid|distinct',
            'sharedContext' => 'required|array', 'finalCriteria' => 'required|string|max:1500', 'steps' => 'required|array|min:1|max:12'])->validate();
        abort_unless(array_is_list($source['steps']) && array_is_list($source['mentions']), 422);
        $milestones = []; $agents = [];
        foreach ($source['steps'] as $step) {
            abort_unless(is_array($step), 422); Schema::only($step, ['key', 'agentId', 'title', 'prompt', 'successCriteria', 'dependsOn']);
            $a = Validator::make($step, ['agentId' => 'required|uuid', 'prompt' => 'required|string|max:4000'])->validate();
            $agents[] = $a['agentId']; unset($step['agentId']); $milestones[] = $step;
        }
        $base = Specs::goal(['agentId' => $spec['agentId'] ?? null, 'runtimeId' => $spec['runtimeId'] ?? null,
            'title' => $spec['title'] ?? null, 'expiresAt' => $spec['expiresAt'] ?? null, 'milestones' => $milestones]);
        abort_unless(\Carbon\CarbonImmutable::parse($base['expiresAt'])->lte(now()->addDays(7)), 422, 'Choose a workflow expiry within seven days.');
        $steps = array_map(fn ($s, $i) => [...$s, 'agentId' => $agents[$i]], $base['milestones'], array_keys($base['milestones'])); unset($base['milestones']);
        abort_if(trim($source['finalCriteria']) === '', 422);
        return [...$base, ...$source, 'sharedContext' => SharedContext::normalize($source['sharedContext']), 'steps' => $steps];
    }
}
