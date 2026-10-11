<?php

namespace Tests\Feature\Teams;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\TeamsSsoFixture;
use Tests\TestCase;

class TeamsSsoInputTest extends TestCase
{
    use RefreshDatabase, TeamsSsoFixture;

    public function test_app_sign_in_refuses_non_string_metadata_before_provider_io(): void
    {
        $this->bootSso();
        $this->configureSso();
        $body = ['email' => 'ada@acme.test', 'flowSecret' => str_repeat('s', 40)];
        foreach (['flowSecret', 'deviceName', 'installId'] as $key) {
            $this->postJson('/api/auth/sso/start', [...$body, $key => ['invalid']])->assertStatus(422);
        }
    }

    public function test_callback_refuses_array_state_and_code_without_a_server_error(): void
    {
        $this->bootSso();
        $this->configureSso();
        $this->assertSame('sso_state', $this->errorOf($this->get('/auth/sso/callback?state[]=invalid')));
        $ada = $this->person('ada@acme.test');
        $start = $this->postJson('/web-api/auth/sso/start', ['email' => $ada->email])->assertOk();
        parse_str(parse_url($start->json('authUrl'), PHP_URL_QUERY), $query);
        $this->assertSame('sso_provider', $this->errorOf($this->get('/auth/sso/callback?state='.$query['state'].'&code[]=invalid')));
        $this->assertGuest();
        $this->assertSame(0, $this->idp->log['/token'] ?? 0);
    }
}
