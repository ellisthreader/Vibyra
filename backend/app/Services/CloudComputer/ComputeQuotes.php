<?php
namespace App\Services\CloudComputer;

use App\Models\VibyraSession;
use App\Services\CloudWorkspaces\{Eligibility};
use App\Services\Vibes\Wallet;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class ComputeQuotes
{
    public function create(VibyraSession $s, array $d): array
    {
        return DB::transaction(function () use ($s, $d) {
            app(Wallet::class)->lock($s->user_id); app(Eligibility::class)->authorize($s->user_id, true);
            $w = app(Computers::class)->find($s->user_id);
            abort_unless($w && in_array($w->state, ['stopped', 'archived', 'expired'], true), 409, 'Stop Cloud before choosing a machine.');
            $trial = !app(PreviewTrial::class)->paidPro($s->user_id);
            abort_if($trial && $d['profile'] !== 'standard', 403, 'The free trial uses Standard only.');
            $p = app(ComputeProfiles::class)->profile($d['profile']);
            $p += ['trial' => $trial, 'native' => (bool) config('cloud_preview.native_enabled'), 'workspaceId' => $w->id, 'generation' => $w->generation + 1, 'revision' => $w->revision, 'region' => $w->region ?: config('cloud_workspaces.region'),
                'deviceId' => $d['deviceId'], 'budgetUnits' => (int) $d['budgetUnits'],
                'deadlineSeconds' => min((int) ($d['deadlineSeconds'] ?? config('cloud_workspaces.max_background_seconds')), $trial ? app(PreviewTrial::class)->remaining($s->user_id) : (int) config('cloud_workspaces.max_background_seconds'))];
            $id = (string) Str::uuid();
            DB::table('cloud_compute_quotes')->insert(['id' => $id, 'workspace_id' => $w->id, 'user_id' => $s->user_id,
                'session_id' => $s->id, 'device_id' => $d['deviceId'], 'payload' => json_encode($p),
                'expires_at' => now()->addMinutes(2), 'created_at' => now(), 'updated_at' => now()]);
            return ['id' => $id, ...$p, 'unitScale' => 10000, 'expiresAt' => now()->addMinutes(2)->timestamp];
        }, 5);
    }

    /** Called with account/workspace locks; acceptance and the runtime hold commit together. */
    public function accept(VibyraSession $s, object $w, array $d): array
    {
        abort_unless(isset($d['quoteId'], $d['requestId'], $d['deviceId']), 409, 'Accept a cloud compute quote before waking.');
        $q = DB::table('cloud_compute_quotes')->where('id', $d['quoteId'])->where('workspace_id', $w->id)
            ->where('user_id', $s->user_id)->where('session_id', $s->id)->where('device_id', $d['deviceId'])->lockForUpdate()->first();
        abort_unless($q, 403, 'This quote belongs to another session or device.');
        if ($q->accepted_at) {
            abort_unless($w->state === 'starting' && $q->request_id === $d['requestId'] && $w->accepted_compute_quote === $q->id, 409, 'This quote was already used.');
            return json_decode($q->payload, true, 32, JSON_THROW_ON_ERROR);
        }
        abort_unless(now()->lt($q->expires_at), 409, 'Cloud quote expired. Review the current rate.');
        $p = json_decode($q->payload, true, 32, JSON_THROW_ON_ERROR);
        abort_unless($p['generation'] === $w->generation + 1 && $p['revision'] === $w->revision, 409, 'Cloud computer changed. Refresh the quote.');
        abort_unless($p['region'] === ($w->region ?: config('cloud_workspaces.region')) && $p['native'] === (bool) config('cloud_preview.native_enabled'), 409, 'Cloud capabilities changed. Refresh the quote.');
        $current = app(ComputeProfiles::class)->profile($p['profile']);
        foreach ($current as $key => $value) abort_unless($p[$key] === $value, 409, 'Cloud tariff changed. Review the new quote.');
        DB::table('cloud_compute_quotes')->where('id', $q->id)->update(['request_id' => $d['requestId'], 'accepted_at' => now(), 'updated_at' => now()]);
        return $p;
    }
}
