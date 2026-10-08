<?php

namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Crypt, DB};
use Tests\TestCase;

/** An account with GitHub connected and the ship loop switched on. */
abstract class WorktreeShipTestCase extends TestCase
{
    use RefreshDatabase;

    protected const REPO = 'fixture/repo';

    protected function setUp(): void
    {
        parent::setUp();
        config(['chat_connectors.enabled' => true, 'worktree_ship.enabled' => true]);
        $this->withToken($this->account('owner', true));
    }

    protected function account(string $token, bool $github): string
    {
        $user = User::factory()->create();
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', $token), 'device_name' => 'Mac']);
        if ($github) DB::table('vibes_integration_installs')->insert(['user_id' => $user->id, 'integration' => 'github',
            'credential' => Crypt::encryptString('gho_fixture'), 'account_label' => 'octocat',
            'connected_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        return $token;
    }
}
