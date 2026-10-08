<?php
namespace App\Services\AgentWork\Proposals;

use App\Services\AgentRuns\Tools\Providers\Schema;
use App\Services\AgentSchedules\Recurrence;
use App\Services\AgentWork\Specs;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Validator;

/** Draft validation has no execution side effects. Owner and runtime are server supplied. */
final class ProposalSpecs
{
    public static function normalize(string $kind, array $spec, string $agentId, string $runtimeId): array
    {
        abort_if(array_key_exists('agentId', $spec) || array_key_exists('runtimeId', $spec), 422, 'A proposal keeps this task’s teammate and AI account.');
        abort_unless(strlen(json_encode($spec, JSON_THROW_ON_ERROR)) <= 32000, 422, 'Keep this plan within 32 KB.');
        $bound = [...$spec, 'agentId' => $agentId, 'runtimeId' => $runtimeId];
        $out = match ($kind) {
            'goal' => Specs::goal($bound),
            'followup' => Specs::followup($bound),
            'routine' => self::routine($spec),
            'skill' => self::skill($spec),
            default => abort(422, 'Choose goal, followup, routine or skill.'),
        };
        unset($out['agentId'], $out['runtimeId']);
        return $out;
    }

    private static function routine(array $spec): array
    {
        Schema::only($spec, ['title', 'prompt', 'timezone', 'recurrence', 'catchUpMinutes', 'overlap']);
        $data = Validator::make($spec, ['title' => 'required|string|max:120', 'prompt' => 'required|string|max:8000',
            'timezone' => 'required|string|max:100', 'recurrence' => 'required|array',
            'catchUpMinutes' => 'sometimes|integer|min:1|max:1440', 'overlap' => 'sometimes|in:skip,queue'])->validate();
        abort_if(trim($data['title']) === '' || trim($data['prompt']) === '', 422, 'Add a title and task.');
        Schema::only($data['recurrence'], ['type', 'time', 'date', 'weekdays']);
        $data['recurrence'] = Recurrence::normalize($data['recurrence'], $data['timezone']);
        abort_unless(Recurrence::next($data['recurrence'], $data['timezone'], CarbonImmutable::now()), 422, 'Choose a future occurrence.');
        return [...$data, 'catchUpMinutes' => $data['catchUpMinutes'] ?? 60, 'overlap' => $data['overlap'] ?? 'skip'];
    }

    private static function skill(array $spec): array
    {
        Schema::only($spec, ['name', 'instructions', 'assignToAgent']);
        abort_unless(is_bool($spec['assignToAgent'] ?? null), 422, 'Choose whether to assign this skill to the teammate.');
        return ['name' => Schema::line($spec['name'] ?? null, 80, 'Add a short skill name.'),
            'instructions' => Schema::text($spec['instructions'] ?? null, 4000, 'Add the skill instructions.'),
            'assignToAgent' => $spec['assignToAgent']];
    }
}
