<?php
namespace App\Services\AgentWork;

use App\Models\AgentV2\{Run, Schedule};
use App\Services\AgentRuns\Canonical;
use App\Services\AgentSchedules\{Recurrence, Schedules};
use App\Services\AgentRuns\Tools\Providers\Schema;
use Illuminate\Support\Facades\{DB, Validator};
use Illuminate\Http\Exceptions\HttpResponseException;

/** Chat review reuses the existing routine engine; the receipt preserves selection authority. */
final class Routines
{
    public static function normalize(array $spec): array
    {
        Schema::only($spec, ['agentId', 'runtimeId', 'title', 'prompt', 'timezone', 'recurrence', 'catchUpMinutes', 'overlap']);
        $data = Validator::make($spec, ['agentId' => 'required|uuid', 'runtimeId' => 'required|uuid',
            'title' => 'required|string|max:120', 'prompt' => 'required|string|max:8000', 'timezone' => 'required|string|max:64',
            'recurrence' => 'required|array', 'catchUpMinutes' => 'sometimes|integer|min:0|max:1440', 'overlap' => 'sometimes|in:skip,queue'])->validate();
        abort_if(trim($data['title']) === '' || trim($data['prompt']) === '', 422, 'Add a routine title and task.');
        $data['timezone'] = Recurrence::zone($data['timezone']);
        $data['recurrence'] = Recurrence::normalize($data['recurrence'], $data['timezone']);
        return $data + ['catchUpMinutes' => 60, 'overlap' => 'skip'];
    }

    public function activate(int $userId, array $spec, string $key): array
    {
        $spec = self::normalize($spec);
        $schedules = app(Schedules::class);
        return app(Activations::class)->save($userId, 'routine', $spec, $key,
            fn () => $schedules->payload($schedules->create($userId, $spec)),
            fn ($id) => $schedules->payload($schedules->find($userId, $id)));
    }

    /** Called under the schedule lock; existing non-chat routines keep their existing semantics. */
    public static function refusal(Schedule $schedule): ?string
    {
        $receipt = self::receipt($schedule);
        if (!$receipt) return null;
        if (!config('agents_v2.work_enabled')) return 'agent_work_disabled';
        if ((int) $receipt->target_revision !== $schedule->revision) return 'routine_review_changed';
        try { RuntimePins::require((int) $schedule->user_id, json_decode($receipt->runtime_snapshot, true)); }
        catch (HttpResponseException $e) { return $e->getResponse()->getData(true)['code'] ?? 'runtime_unavailable'; }
        return null;
    }

    public static function pinRun(Schedule $schedule, Run $run): void
    {
        $receipt = self::receipt($schedule);
        if ($receipt) RuntimePins::saveRun($run, json_decode($receipt->runtime_snapshot, true), 'routine', $schedule->id, null);
    }

    /** Explicit user edits may review a new runtime only when that runtime was included in the edit. */
    public static function reviewUpdate(Schedule $schedule, bool $runtimeReviewed): void
    {
        $receipt = self::receipt($schedule);
        if (!$receipt) return;
        $snapshot = json_decode($receipt->runtime_snapshot, true);
        if ($runtimeReviewed) abort_unless(is_string($schedule->runtime_binding_id), 422, 'Choose the exact runtime for this reviewed routine.');
        if ($runtimeReviewed) $snapshot = [...RuntimePins::capture((int) $schedule->user_id, $schedule->runtime_binding_id),
            'workAgentId' => $schedule->agent_id, 'skillsHash' => SkillSnapshots::selectionHash((int) $schedule->user_id, $schedule->agent_id)];
        else RuntimePins::require((int) $schedule->user_id, $snapshot);
        DB::table('agent_work_activations')->where('id', $receipt->id)->update(['target_revision' => $schedule->revision,
            'runtime_snapshot' => Canonical::json($snapshot), 'updated_at' => now()]);
    }

    private static function receipt(Schedule $schedule): ?object
    {
        return DB::table('agent_work_activations')->where('user_id', $schedule->user_id)->where('kind', 'routine')->where('target_id', $schedule->id)->first();
    }
}
