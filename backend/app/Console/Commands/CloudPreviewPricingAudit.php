<?php
namespace App\Console\Commands;
use App\Services\CloudComputer\ComputeEconomics;
use Illuminate\Console\Command;
final class CloudPreviewPricingAudit extends Command
{
    protected $signature='cloud-preview:pricing-audit {--json}';
    protected $description='Review every Cloud Preview profile against all membership offers without enabling it.';
    public function handle(ComputeEconomics $economics): int
    {
        $profiles=[]; $passed=true;
        foreach(config('cloud_preview.profiles') as $name=>$profile) {
            $audit=$economics->audit($profile);
            $profiles[$name]=['tokensPerHour'=>$profile['units_per_hour']/10000,
                'proMonthlyHoursIfAllTokensUsed'=>300*10000/$profile['units_per_hour'],...$audit];
            $passed=$passed && $audit['passed'];
        }
        $overhead=config('cloud_preview.startup_exposure_micro')>0 && config('cloud_preview.egress_micro_per_gib')>0;
        $result=['passed'=>$passed && $overhead,'tariffVersion'=>config('cloud_preview.tariff_version'),'profiles'=>$profiles,
            'overheadVerified'=>$overhead,'minimumMargin'=>config('cloud_preview.minimum_margin'),
            'freeTrialSeconds'=>config('cloud_preview.trial_seconds'),'dailyExposureMicroUsd'=>config('cloud_preview.daily_micro_limit'),
            'monthlyExposureMicroUsd'=>config('cloud_preview.monthly_micro_limit'),
            'enabled'=>(bool)config('cloud_preview.enabled'),'note'=>'Estimates only. Passing does not replace provider invoices, native device acceptance or the rollout gates.'];
        $this->line(json_encode($result,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR));
        return $result['passed'] ? self::SUCCESS : self::FAILURE;
    }
}
