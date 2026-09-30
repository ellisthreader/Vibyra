<?php

namespace Tests\Feature;

use App\Services\AgentRuns\Connections\LegacyInstalls;
use App\Services\ChatConnectors\Installs;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Artisan, Crypt, DB};
use Tests\Support\AgentV2Fixture;
use Tests\TestCase;

class AgentV2ConnectionsTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
    }

    public function test_backfill_is_chunked_time_bounded_resumable_and_idempotent(): void
    {
        $rows = [];
        for ($i = 1; $i <= 450; $i++) $rows[] = ['user_id' => $this->user->id, 'integration' => 'p'.$i, 'credential' => Crypt::encryptString('x'),
            'account_label' => 'a'.$i, 'connected_at' => now(), 'created_at' => now(), 'updated_at' => now()];
        foreach (array_chunk($rows, 100) as $chunk) DB::table('vibes_integration_installs')->insert($chunk);
        $before = DB::table('agent_connections')->count();

        $last = LegacyInstalls::backfill(null, microtime(true) - 1); // the deadline has passed: one chunk of 200, then it stops
        $this->assertSame($before + 200, DB::table('agent_connections')->count());
        $last = LegacyInstalls::backfill(null, null, $last);        // resumes past the last id it reported
        $this->assertSame($before + 450, DB::table('agent_connections')->count());
        LegacyInstalls::backfill();
        LegacyInstalls::backfill(null, null, $last);
        $this->assertSame($before + 450, DB::table('agent_connections')->count(), 'Re-running adds nothing.');

        $this->assertSame(0, Artisan::call('vibyra:agent-v2-backfill-installs'));
        $this->assertStringContainsString('(done)', Artisan::output());
    }

    public function test_existing_installs_get_stable_ids_and_keep_working_for_ordinary_chat(): void
    {
        DB::table('vibes_integration_installs')->insert([
            ['user_id' => $this->user->id, 'integration' => 'gmail', 'credential' => Crypt::encryptString('legacy-gmail'),
                'account_label' => 'owner@example.com', 'connected_at' => now(), 'created_at' => now(), 'updated_at' => now()],
            ['user_id' => $this->user->id, 'integration' => 'github', 'credential' => Crypt::encryptString('legacy-gh'),
                'account_label' => 'octocat', 'connected_at' => now(), 'created_at' => now(), 'updated_at' => now()],
        ]);
        // The optional pre-warm, twice: idempotent (the migration itself is schema only).
        LegacyInstalls::backfill();
        LegacyInstalls::backfill();
        $rows = DB::table('agent_connections')->where('user_id', $this->user->id)->orderBy('provider')->get();
        $this->assertSame(['github', 'gmail'], $rows->pluck('provider')->all());
        $this->assertSame(['octocat', 'owner@example.com'], $rows->pluck('external_identity')->all());
        $this->assertTrue($rows->every(fn ($r) => $r->install_id !== null && $r->credential === null));
        $gmailId = $rows->firstWhere('provider', 'gmail')->id;
        $listed = $this->getJson('/api/agents/v2/connections')->assertOk()->json('connections');
        $this->assertSame($gmailId, collect($listed)->firstWhere('provider', 'gmail')['id']);
        $this->assertSame('install', collect($listed)->firstWhere('provider', 'gmail')['source']);
        $this->assertStringNotContainsString('legacy-gmail', json_encode($listed));
        // Ordinary chat's credential path is unchanged.
        $this->assertSame('legacy-gmail', app(Installs::class)->credential($this->user->id, 'gmail'));
    }

    public function test_reconnecting_bumps_generation_and_a_different_account_gets_a_new_id(): void
    {
        $first = $this->gmailInstall('owner@example.com');
        $this->grant($first);
        DB::table('vibes_integration_installs')->where('user_id', $this->user->id)->update(['connected_at' => now()->addMinute()]);
        LegacyInstalls::sync($this->user->id);
        $this->assertSame(2, (int) DB::table('agent_connections')->where('id', $first)->value('generation'));
        $second = $this->gmailInstall('someone-else@example.com', 'other-token');
        $this->assertNotSame($first, $second);
        $this->assertNotNull(DB::table('agent_connections')->where('id', $first)->value('revoked_at'));
        $this->assertNotNull(DB::table('agent_grants')->where('connection_id', $first)->value('revoked_at'),
            'A grant on the old account never carries over to a new one.');
        $this->getJson('/api/agents/v2/agents/'.$this->agent['id'].'/grants')->assertOk()->assertJsonPath('grants', []);
    }

    public function test_grants_are_revisioned_and_only_offer_catalogue_operations(): void
    {
        $connection = $this->gmailInstall('owner@example.com');
        $this->assertSame(1, $this->grant($connection)['revision']);
        $this->assertSame(1, $this->grant($connection)['revision'], 'An unchanged grant keeps its revision.');
        $this->assertSame(2, $this->grant($connection, ['gmail_read'])['revision']);
        $this->putJson('/api/agents/v2/agents/'.$this->agent['id'].'/grants/'.$connection, ['operations' => ['github_read']])
            ->assertStatus(422)->assertJsonPath('code', 'invalid_operations');
        $this->deleteJson('/api/agents/v2/agents/'.$this->agent['id'].'/grants/'.$connection)->assertOk();
        $this->getJson('/api/agents/v2/agents/'.$this->agent['id'].'/grants')->assertOk()->assertJsonPath('grants', []);
    }
}
