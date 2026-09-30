<?php
namespace App\Services\Progress;
use Illuminate\Support\Facades\DB;
final class WorkEvents
{
    public function observe(string $turnId): void
    {
        if (!config('intelligence.events')) return;
        DB::transaction(function () use ($turnId) {
            $turn = DB::table('vibes_turns')->where('id', $turnId)->lockForUpdate()->first();
            if (!$turn) return;
            $data = app(TurnObservation::class)->read($turn);
            $this->record((int) $turn->user_id, 'cloud_turn', $turnId, $data);
        });
    }

    public function record(int $user, string $source, string $run, array $data): void
    {
        // Deduplicate adjacent observations, not every historical occurrence of a state.
        $existing = DB::table('work_progress')->where('source', $source)->where('run_id', $run)->first();
        if ($existing && json_decode($existing->metadata, true) === $data) return;
        $fingerprint = hash('sha256', json_encode([$user, $source, $run, $existing?->event_id, $data]));
        if (DB::table('work_events')->where('fingerprint', $fingerprint)->exists()) return;
        DB::table('work_events')->insertOrIgnore(['user_id' => $user, 'source' => $source, 'run_id' => $run,
            'fingerprint' => $fingerprint, 'phase' => $data['phase'], 'metadata' => json_encode($data), 'created_at' => now()]);
        $event = DB::table('work_events')->where('fingerprint', $fingerprint)->first();
        $existing = DB::table('work_progress')->where('source', $source)->where('run_id', $run)->first();
        if ($existing && $existing->event_id >= $event->id) return;
        DB::table('work_progress')->updateOrInsert(['source' => $source, 'run_id' => $run],
            ['user_id' => $user, 'event_id' => $event->id, 'phase' => $data['phase'],
                'metadata' => json_encode($data), 'assessment' => null, 'observed_at' => now()]);
    }

    public function payload(int $user, string $run): ?array
    {
        if (!config('intelligence.events')) return null;
        $p = DB::table('work_progress')->where('user_id', $user)->where('source', 'cloud_turn')->where('run_id', $run)->first();
        $assessment = $p?->assessment ? json_decode($p->assessment, true) : null;
        if (!in_array(config('intelligence.jev_mode'), ['shadow','active']) || config('intelligence.progress_mode') !== 'advisory' || !DB::table('notification_preferences')->where('user_id', $user)->value('smart')
            || !$assessment || now()->diffInMinutes(\Illuminate\Support\Carbon::parse($assessment['assessedAt'] ?? '2000-01-01'), true) > 10) $assessment = null;
        return $p ? ['phase' => $p->phase, 'sequence' => $p->event_id, 'observedAt' => $p->observed_at,
            'assessment' => $assessment] : null;
    }
}
