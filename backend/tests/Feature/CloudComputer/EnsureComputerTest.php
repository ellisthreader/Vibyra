<?php
namespace Tests\Feature\CloudComputer;

use Illuminate\Support\Facades\DB;

/** Nobody sets the cloud computer up: once connected (phone consent, given in setUp), an entitled account has one the first time its state is read. */
class EnsureComputerTest extends ComputerTestCase
{
    private function computers(): int
    {
        return DB::table('cloud_workspaces')->where('user_id', $this->user->id)->where('kind', 'computer')->count();
    }

    public function test_reading_the_state_creates_one_stopped_computer_without_a_machine(): void
    {
        $this->assertSame(0, $this->computers());
        $s = $this->getJson('/api/cloud-computer')->assertOk()->assertJsonPath('enabled', true)->json('computer');
        $this->assertSame('stopped', $s['state']);
        $this->assertNull($s['hostId']);
        $this->assertSame(1, $this->computers());
        $row = DB::table('cloud_workspaces')->where('user_id', $this->user->id)->where('kind', 'computer')->first();
        $this->assertNull($row->machine_id); $this->assertNull($row->volume_id); $this->assertNull($row->terms_accepted_at);
        $this->assertSame([], $this->provider->calls); // no provider call: no cost until a wake
    }

    public function test_reading_again_and_the_old_create_call_find_the_same_computer(): void
    {
        $id = $this->getJson('/api/cloud-computer')->json('computer.workspaceId');
        $this->getJson('/api/cloud-computer')->assertJsonPath('computer.workspaceId', $id);
        $this->createComputer();
        $this->assertSame(1, $this->computers());
        $this->assertSame($id, DB::table('cloud_workspaces')->where('user_id', $this->user->id)->where('kind', 'computer')->value('id'));
    }

    public function test_a_free_account_gets_no_computer_and_is_not_enabled(): void
    {
        DB::table('membership_periods')->where('user_id', $this->user->id)->delete();
        $this->getJson('/api/cloud-computer')->assertOk()->assertJsonPath('enabled', false)->assertJsonPath('computer', null);
        $this->assertSame(0, $this->computers());
    }

    public function test_flags_off_creates_nothing(): void
    {
        config(['cloud_workspaces.enabled' => false]);
        $this->getJson('/api/cloud-computer')->assertOk()->assertJsonPath('enabled', false)->assertJsonPath('computer', null);
        $this->assertSame(0, $this->computers());
    }

    public function test_first_wake_still_asks_for_terms_unless_the_signup_terms_cover_them(): void
    {
        $this->getJson('/api/cloud-computer');
        $this->wake(false)->assertStatus(422)->assertJsonPath('code', 'terms_required');
        if (!\Illuminate\Support\Facades\Schema::hasTable('legal_acceptances')) return; // this release has no signup legal acceptances
        DB::table('legal_acceptances')->insert(['user_id' => $this->user->id, 'terms_version' => '2026-10-05', 'privacy_version' => '2026-09-28',
            'country_code' => 'GB', 'surface' => 'ios', 'adult_attested_at' => now(), 'accepted_at' => now()]);
        $this->wake(false)->assertStatus(422); // that version is not listed as covering cloud storage
        config(['cloud_workspaces.computer_terms_versions' => ['2026-10-05']]);
        $this->wake(false)->assertStatus(202)->assertJsonPath('computer.state', 'starting');
        $this->assertNotNull(DB::table('cloud_workspaces')->where('user_id', $this->user->id)->where('kind', 'computer')->value('terms_accepted_at'));
    }
}
