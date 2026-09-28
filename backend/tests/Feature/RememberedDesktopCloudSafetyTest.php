<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RememberedDesktopCloudSafetyTest extends TestCase
{
    use RefreshDatabase;

    public function test_cloud_state_never_persists_local_desktop_credentials(): void
    {
        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Desktop Safety',
            'email' => 'desktop-safety@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/session/state', [
            'rememberedDesktops' => [[
                'url' => 'http://127.0.0.1:4317',
                'pairCode' => 'ABCD12',
                'machineName' => 'Workstation',
                'status' => 'online',
                'token' => 'local-desktop-secret',
                'unexpectedSecret' => 'must-not-reach-cloud-storage',
            ]],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonMissing(['token' => 'local-desktop-secret'])
            ->assertJsonMissing(['unexpectedSecret' => 'must-not-reach-cloud-storage']);

        $desktop = User::where('email', 'desktop-safety@example.com')
            ->firstOrFail()
            ->remembered_desktops[0];

        $this->assertSame('ABCD12', $desktop['pairCode']);
        $this->assertArrayNotHasKey('token', $desktop);
        $this->assertArrayNotHasKey('unexpectedSecret', $desktop);
    }
}
