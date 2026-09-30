<?php
namespace App\Services\CloudWorkspaces;

use App\Services\Vibes\{AgentTools, Wallet};
use Illuminate\Support\Facades\DB;

final class Ai
{
    public function dispatch(object $turn, array $request): void
    {
        if (!isset($request['vibyraCloud'])) return;
        $w = DB::table('cloud_workspaces')->where('id', $request['vibyraCloud']['workspaceId'])->first();
        abort_unless($w && $w->generation === $request['vibyraCloud']['generation'] && $w->state === 'ready'
            && $w->lease_until && now()->lt($w->lease_until) && app(Access::class)->deviceActive($w->device_id, $w->device_generation, $w->user_id), 409, 'Cloud execution authority expired.');
        app(Eligibility::class)->authorize($turn->user_id);
        abort_unless(config('cloud_workspaces.ai_enabled'), 503, 'Cloud AI is paused.');
    }
    public function quote(object $chat, array &$request, int|float $maximum, int $scale): int|float
    {
        $w = app(Budgets::class)->forChat($chat);
        if (!$w) return $maximum;
        app(Budgets::class)->guardAi($chat, 0);
        $access = app(Access::class)->verify(request(), $w);
        $remaining = max(0, $w->budget_units - app(Budgets::class)->committed($w) - Quotes::runway($w->units_per_hour));
        $request['vibyraCloud'] = ['workspaceId' => $w->id, 'generation' => $w->generation, 'access' => $access];
        abort_unless($remaining > 0, 402, 'This computer needs more budget for AI and safe shutdown.');
        return min($maximum, $remaining / $scale, config('cloud_workspaces.ai_turn_max_units') / $scale);
    }
    public function definitions(object $w): array
    {
        $q = DB::table('cloud_quotes')->where('id', $w->operation_id)->firstOrFail();
        $policy = json_decode($q->payload, true);
        $tools = $policy['canWrite'] ? AgentTools::definitions() : array_values(array_filter(AgentTools::definitions(),
            fn ($t) => in_array($t['function']['name'], AgentTools::readNames(), true)));
        if ($policy['commands']) $tools[] = ['type' => 'function', 'function' => ['name' => 'cloud_run_command',
            'description' => 'Run one exact command preapproved for this cloud session. No other command is permitted.',
            'parameters' => ['type' => 'object', 'properties' => ['command' => ['type' => 'string', 'enum' => $policy['commands']]],
                'required' => ['command'], 'additionalProperties' => false]]];
        return $tools;
    }
    public function guardSubmit(object $chat, array $request): void
    {
        $w = app(Budgets::class)->forChat($chat);
        if (!$w) return;
        $access = app(Access::class)->verify(request(), $w);
        $quoted = $request['vibyraCloud'] ?? [];
        abort_unless(($quoted['workspaceId'] ?? null) === $w->id && ($quoted['generation'] ?? null) === $w->generation
            && ($quoted['access'] ?? null) === $access, 409, 'Cloud authority changed. Refresh the AI quote.');
    }
}
