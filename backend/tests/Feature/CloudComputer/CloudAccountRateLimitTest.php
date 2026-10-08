<?php
namespace Tests\Feature\CloudComputer;

use Illuminate\Support\Str;

class CloudAccountRateLimitTest extends ComputerTestCase
{
    public function test_rotating_invalid_sync_bearers_share_the_account_ip_ceiling(): void
    {
        $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.40']);
        for ($request = 0; $request < 600; $request++) {
            $path = '/api/cloud-computer/sync'; // Main retains its stricter read-IP limiter.
            $this->withToken(Str::random(72))->getJson($path)->assertStatus(401);
        }
        $this->withToken(Str::random(72))->getJson('/api/cloud-computer')->assertStatus(429);
        $this->withToken('cloud-test')->getJson('/api/cloud-computer/sync')->assertStatus(429);
        $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.41']);
        $this->withToken(Str::random(72))->getJson('/api/cloud-computer')->assertStatus(401);
        $this->withToken('cloud-test')->getJson('/api/cloud-computer/sync')->assertOk();
    }
    public function test_rotating_invalid_bearers_share_an_ip_ceiling_across_account_and_sync_routes(): void
    {
        $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.40']);
        for ($request = 0; $request < 600; $request++) {
            $path = $request % 2 === 0 ? '/api/cloud-computer' : '/api/cloud-computer/sync';
            $this->withToken(Str::random(72))->getJson($path)->assertStatus(401);
        }
        $this->withToken(Str::random(72))->getJson('/api/cloud-computer')->assertStatus(429);
        $this->withToken('cloud-test')->getJson('/api/cloud-computer/sync')->assertStatus(429);
        $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.41']);
        $this->withToken(Str::random(72))->getJson('/api/cloud-computer')->assertStatus(401);
        $this->withToken('cloud-test')->getJson('/api/cloud-computer/sync')->assertOk();
    }
}
