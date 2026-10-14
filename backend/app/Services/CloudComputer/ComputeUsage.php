<?php
namespace App\Services\CloudComputer;

use App\Services\CloudWorkspaces\Budgets;
use Illuminate\Support\Facades\DB;

final class ComputeUsage
{
    public function current(object $w): array
    {
        $used = max(0, app(Budgets::class)->committed($w) - (int) ($w->compute_budget_start ?? 0));
        $budget = max(0, (int) $w->budget_units - (int) ($w->compute_budget_start ?? 0));
        return ['trialSecondsRemaining' => ($w->compute_trial ?? false) ? app(PreviewTrial::class)->remaining($w->user_id) : null,
            'profile' => $w->compute_profile ?? null, 'tariffVersion' => $w->tariff_version,
            'unitsPerHour' => (string) $w->units_per_hour, 'sessionBudgetUnits' => (string) $budget,
            'committedUnits' => (string) $used, 'remainingUnits' => (string) max(0, $budget - $used),
            'unitScale' => 10000, 'quoteRequired' => (bool) config('cloud_preview.enabled'),
            'previewAvailable' => (bool) config('cloud_preview.enabled') && (bool) ($w->compute_profile ?? null),
            'nativeAvailable' => (bool) config('cloud_preview.enabled') && app(ComputeProfiles::class)->native($w)];
    }
    public function payload(int $user, ?string $before = null): array
    {
        $w = app(Computers::class)->find($user);
        $cursor = $before ? json_decode(base64_decode(strtr($before, '-_', '+/'), true) ?: '', true) : null;
        abort_if($before && (!is_array($cursor) || !is_string($cursor['at'] ?? null) || !\Illuminate\Support\Str::isUuid($cursor['id'] ?? '')
            || !preg_match('/^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,6})?$/', $cursor['at'])), 422, 'Invalid usage cursor.');
        $rows = DB::table('cloud_reservations')->where('user_id', $user)->whereNotNull('settled_at')
            ->when($cursor, fn ($q) => $q->where(fn ($q) => $q->where('created_at', '<', $cursor['at'])->orWhere(fn ($q) => $q->where('created_at', $cursor['at'])->where('id', '<', $cursor['id']))))->orderByDesc('created_at')->orderByDesc('id')->limit(50)->get();
        return ['current' => $w ? $this->current($w) : null, 'receipts' => $rows->map(fn ($r) => [
            'id' => $r->id, 'workspaceId' => $r->workspace_id, 'generation' => $r->generation,
            'profile' => $r->compute_profile, 'trial' => (bool) $r->preview_trial,
            'tariffVersion' => $r->tariff_version, 'seconds' => $r->billed_seconds, 'chargedUnits' => (string) $r->charged,
            'providerEstimatedMicroUsd' => (string) $r->actual_micro_usd, 'settledAt' => $r->settled_at,
        ])->all(), 'nextBefore' => $rows->count() === 50 ? rtrim(strtr(base64_encode(json_encode(['at'=>$rows->last()->created_at, 'id'=>$rows->last()->id])), '+/', '-_'), '=') : null];
    }
}
