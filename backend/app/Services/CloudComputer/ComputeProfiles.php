<?php
namespace App\Services\CloudComputer;

/** Exact resource and price snapshots. A provider estimate of zero must never launch. */
final class ComputeProfiles
{
    public function profile(string $name): array
    {
        $p = config('cloud_preview.profiles.'.$name);
        abort_unless(in_array($name, ['standard', 'desktop', 'power'], true) && is_array($p), 422, 'Unknown cloud profile.');
        abort_unless(config('cloud_preview.enabled') && config('cloud_preview.economics_verified'), 503, 'Cloud Preview is awaiting release checks.');
        abort_unless(config('cloud_preview.egress_micro_per_gib') > 0 && config('cloud_preview.startup_exposure_micro') > 0, 503, 'Cloud overhead costs need verification.');
        abort_unless(app(ComputeEconomics::class)->audit($p)['passed'], 503, 'Cloud profile pricing needs verification.');
        return ['profile' => $name, 'cpuKind' => 'performance', 'cpus' => (int) $p['cpus'], 'memoryMb' => (int) $p['memory_mb'],
            'unitsPerHour' => (int) $p['units_per_hour'], 'providerMicroPerHour' => (int) $p['provider_micro_per_hour'],
            'tariffVersion' => config('cloud_preview.tariff_version')];
    }

    public function matches(object $w, array $actual): bool
    {
        if (!empty($actual['gpu_kind']) || !empty($actual['gpus'])) return false;
        foreach ($this->guest($w) as $key => $value) if (($actual[$key] ?? null) !== $value) return false;
        return true;
    }
    public function guest(object $w): array
    {
        if (!($w->compute_profile ?? null)) return ['cpu_kind' => 'performance', 'cpus' => 2, 'memory_mb' => 4096];
        $p = $this->snapshot($w);
        return ['cpu_kind' => $p['cpuKind'], 'cpus' => $p['cpus'], 'memory_mb' => $p['memoryMb']];
    }
    public function native(object $w): bool
    {
        return (bool) ($w->compute_profile ?? null) && (bool) config('cloud_preview.native_enabled') && $this->snapshot($w)['native'];
    }
    public function snapshot(object $w): array
    {
        $q = \Illuminate\Support\Facades\DB::table('cloud_compute_quotes')->where('id', $w->accepted_compute_quote)
            ->where('user_id', $w->user_id)->where('workspace_id', $w->id)->whereNotNull('accepted_at')->first();
        abort_unless($q, 503, 'Cloud profile has no accepted resource quote.');
        $p = json_decode($q->payload, true, 32, JSON_THROW_ON_ERROR);
        abort_unless($p['generation'] === (int) $w->generation && $p['profile'] === $w->compute_profile && $p['tariffVersion'] === $w->tariff_version
            && $p['unitsPerHour'] === (int) $w->units_per_hour && $p['providerMicroPerHour'] === (int) $w->provider_micro_per_hour,
            503, 'Cloud profile quote does not match this generation.');
        return $p;
    }
}
