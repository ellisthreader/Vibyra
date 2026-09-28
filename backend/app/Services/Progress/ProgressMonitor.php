<?php
namespace App\Services\Progress;
use App\Jobs\ClassifyDecision;
use Illuminate\Support\Facades\{Crypt, DB};
use Illuminate\Support\Str;
final class ProgressMonitor
{
    public function consider(object $progress): void
    {
        if (config('intelligence.progress_mode') === 'off' || config('intelligence.jev_mode') === 'off'
            || !in_array($progress->phase, ['working','tool_waiting','queued'])) return;
        if (!DB::table('notification_preferences')->where('user_id', $progress->user_id)->value('smart')) return;
        $tools = DB::table('vibes_tools')->where('turn_id', $progress->run_id)->whereNotNull('result')->orderByDesc('created_at')->limit(12)->get();
        $attempts = [];
        foreach ($tools as $tool) {
            if (in_array($tool->action_state, ['pending','dispatching','unknown'])) continue;
            $result = json_decode($tool->result, true);
            if (empty($result['error'])) continue;
            // Only fingerprints and fixed operation names leave this runtime, never arguments or output.
            $attempts[] = ['operation' => $tool->operation,
                'sameAttempt' => hash('sha256', $tool->operation.$tool->arguments.$tool->result), 'failed' => true];
        }
        $counts = array_count_values(array_column($attempts, 'sameAttempt'));
        if (!$counts || max($counts) < 3) return;
        $fingerprint = substr(hash('sha256', 'progress:'.$progress->id), 0, 40).':'.now()->format('YmdHi');
        $previous = DB::table('ai_decisions')->where('user_id', $progress->user_id)->where('purpose', 'progress');
        if ((clone $previous)->where('fingerprint', 'like', substr($fingerprint, 0, 40).'%')->count() >= 10
            || (clone $previous)->where('fingerprint', $fingerprint)->exists()
            || (clone $previous)->where('created_at', '>', now()->subMinute())->exists()) return;
        $id = (string) Str::uuid();
        DB::table('ai_decisions')->insert(['id' => $id, 'user_id' => $progress->user_id, 'purpose' => 'progress',
            'fingerprint' => $fingerprint, 'deadline' => now()->addSeconds(30),
            'input' => Crypt::encryptString(json_encode(['progressId' => $progress->id, 'sequence' => $progress->event_id,
                'state' => ['attempts' => $attempts, 'phase' => $progress->phase]])), 'created_at' => now(), 'updated_at' => now()]);
        ClassifyDecision::dispatch($id);
    }
    public function apply(object $decision): void
    {
        if ($decision->state !== 'classified' || !$decision->input) return;
        // Inference has its own deadline; the minute scheduler may apply a timely
        // result later, but a delayed worker must never revive old evidence.
        if (now()->diffInSeconds(\Illuminate\Support\Carbon::parse($decision->updated_at), true) > 120) {
            DB::table('ai_decisions')->where('id', $decision->id)->where('state', 'classified')
                ->update(['state' => 'expired', 'input' => null, 'updated_at' => now()]);
            return;
        }
        $input = json_decode(Crypt::decryptString($decision->input), true);
        $result = json_decode(Crypt::decryptString($decision->result), true);
        $answer = $result['answers']['progress'] ?? [];
        // Shadow records are auditable but never affect a projection.
        if (in_array(config('intelligence.jev_mode'), ['shadow','active']) && config('intelligence.progress_mode') === 'advisory' && ($answer['confidence'] ?? 0) >= config('intelligence.confidence')
            && in_array($answer['choice'] ?? '', ['possible_loop','possible_blocker'])
            && DB::table('notification_preferences')->where('user_id', $decision->user_id)->value('smart')) {
            DB::transaction(function () use ($input, $answer, $result, $decision) {
                $p = DB::table('work_progress')->where('id', $input['progressId'])->where('user_id', $decision->user_id)
                    ->where('event_id', $input['sequence'])->whereIn('phase', ['working','queued','tool_waiting'])->lockForUpdate()->first();
                if (!$p) return;
                $turn = DB::table('vibes_turns')->where('id', $p->run_id)->where('user_id', $p->user_id)->first();
                if (!$turn || app(TurnObservation::class)->read($turn) !== json_decode($p->metadata, true)) return;
                $old = $p->assessment ? json_decode($p->assessment, true) : [];
                $same = ($old['label'] ?? null) === $answer['choice'] && ($old['sequence'] ?? null) === $input['sequence']
                    && now()->diffInMinutes(\Illuminate\Support\Carbon::parse($old['assessedAt'] ?? '2000-01-01'), true) <= 10;
                $windows = $same ? ($old['windows'] ?? 1) + (($old['window'] ?? '') !== $decision->fingerprint ? 1 : 0) : 1;
                $assessment = ['label' => $answer['choice'], 'sequence' => $input['sequence'], 'windows' => $windows,
                    'window' => $decision->fingerprint, 'assessedAt' => now()->toIso8601String(), 'model' => $result['model'], 'confidence' => $answer['confidence']];
                DB::table('work_progress')->where('id', $p->id)->update(['assessment' => json_encode($assessment)]);
                if ($windows < 2 || DB::table('work_events')->where('run_id', $p->run_id)
                    ->whereIn('phase', ['possible_loop','possible_blocker'])->where('created_at', '>', now()->subMinutes(10))->exists()) return;
                // Advisory events refer to execution evidence; they never replace the runtime phase.
                $metadata = [...json_decode($p->metadata, true), 'evidenceEvent' => $p->event_id, 'runtimePhase' => $p->phase];
                DB::table('work_events')->insertOrIgnore(['user_id' => $p->user_id, 'source' => $p->source, 'run_id' => $p->run_id,
                    'fingerprint' => hash('sha256', 'advisory:'.$p->id.':'.$p->event_id.':'.$answer['choice']),
                    'phase' => $answer['choice'], 'metadata' => json_encode($metadata), 'created_at' => now()]);
            });
        }
        if (($answer['confidence'] ?? 0) < config('intelligence.confidence') || !in_array($answer['choice'] ?? '', ['possible_loop','possible_blocker'])) {
            DB::table('work_progress')->where('id', $input['progressId'])->where('user_id', $decision->user_id)
                ->where('event_id', $input['sequence'])->update(['assessment' => null]);
        }
        DB::table('ai_decisions')->where('id', $decision->id)->where('state', 'classified')->update(['state' => 'observed', 'input' => null, 'updated_at' => now()]);
    }
}
