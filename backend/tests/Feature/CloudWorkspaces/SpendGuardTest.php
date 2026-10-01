<?php
namespace Tests\Feature\CloudWorkspaces;

use Illuminate\Support\Facades\{DB, Log};
use Illuminate\Support\Str;

class SpendGuardTest extends CloudTestCase
{
    private function spent(int $micro): void
    {
        DB::table('vibes_spend_days')->insertOrIgnore(['day' => now()->toDateString()]);
        DB::table('vibes_spend_days')->where('day', now()->toDateString())->update(['spent' => $micro]);
    }

    public function test_new_starts_stop_at_the_soft_limit_but_a_running_computer_is_not_cut_off(): void
    {
        $id = $this->imported();
        config(['cloud_workspaces.daily_micro_limit' => 1000]);
        $this->spent(899);
        $q = $this->postJson('/api/cloud-workspaces/'.$id.'/quote', ['revision' => 1, 'deviceId' => $this->device->uuid,
            'model' => 'test/model', 'budgetUnits' => 500000, 'seconds' => 3600, 'canWrite' => true, 'commands' => []])->assertOk()->json('quote');
        $this->spent(901);
        $proof = sodium_crypto_box_seal_open(base64_decode($q['challenge']['ciphertext']), $this->keys);
        $this->postJson('/api/cloud-workspaces/'.$id.'/start', ['quoteId' => $q['id'], 'proof' => base64_encode($proof), 'consent' => true])
            ->assertStatus(503)->assertSee("Hosted computing has reached today",false);
    }

    public function test_the_monthly_ceiling_blocks_new_holds_across_days(): void
    {
        config(['cloud_workspaces.monthly_micro_limit' => 5000, 'cloud_workspaces.soft_stop_percent' => 100]);
        DB::table('vibes_spend_days')->insert(['day' => now()->startOfMonth()->toDateString(), 'spent' => 4999]);
        $this->expectExceptionMessage('Hosted computing is at capacity.');
        app(\App\Services\CloudWorkspaces\SpendGuard::class)->holdMonth(2);
    }

    public function test_storage_is_capped_across_all_accounts(): void
    {
        config(['cloud_workspaces.max_retained_global' => 1]);
        $this->imported();
        $this->postJson('/api/cloud-workspaces', ['id' => (string) Str::uuid(), 'name' => 'Second', 'projectId' => 'second'])
            ->assertStatus(503)->assertSee("Hosted storage is at capacity");
    }

    public function test_a_spend_warning_is_raised_once_per_day_at_eighty_percent(): void
    {
        config(['cloud_workspaces.daily_micro_limit' => 1000, 'cloud_workspaces.soft_stop_percent' => 100]);
        $this->spent(800);
        Log::shouldReceive('critical')->once()->with('cloud.spend.warning', \Mockery::type('array'));
        $guard = app(\App\Services\CloudWorkspaces\SpendGuard::class);
        $guard->admitStart(); $guard->admitStart();
    }
}
