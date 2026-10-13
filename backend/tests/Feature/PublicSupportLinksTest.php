<?php

namespace Tests\Feature;

use App\Models\PublicRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PublicSupportLinksTest extends TestCase
{
    use RefreshDatabase;

    public function test_support_destination_is_public_and_preselects_product_support(): void
    {
        config(['legal.market_enforcement' => true, 'services.turnstile.enabled' => true]);
        $this->get('/privacy/requests?topic=support')->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertSee('value="support" selected', false)
            ->assertSee('name="_token"', false)
            ->assertSee('action="'.url('/privacy/requests').'"', false)
            ->assertSee('support@vibyra.net');
    }

    public function test_account_deletion_destination_is_available_without_login_or_human_check(): void
    {
        config(['legal.market_enforcement' => true, 'services.turnstile.enabled' => true]);
        $this->get('/account/delete')->assertOk()
            ->assertSee('Delete your account')
            ->assertSee('Settings → Account → Delete account')
            ->assertSee('/privacy/requests?topic=privacy_deletion', false)
            ->assertSee('does not immediately delete an account')
            ->assertSee('does not by itself cancel an App Store subscription');
    }

    public function test_deletion_request_records_only_a_request_and_never_deletes_the_account(): void
    {
        $user = User::factory()->create(['email' => 'requester@example.com']);
        $this->post('/privacy/requests', ['email' => $user->email, 'topic' => 'privacy_deletion'])
            ->assertRedirect('/privacy/requests')->assertSessionHas('request_reference');
        $this->assertModelExists($user);
        $this->assertSame('privacy_deletion', PublicRequest::query()->sole()->topic);
        $this->get('/privacy/requests')->assertOk()->assertSee('Your request was recorded. Reference:');
    }

    public function test_invalid_query_values_are_not_rendered_as_markup(): void
    {
        $this->get('/privacy/requests?topic='.urlencode('<script>alert(1)</script>'))->assertOk()
            ->assertDontSee('<script>alert(1)</script>', false);
    }

    public function test_legacy_app_hosts_redirect_before_the_form_creates_a_session(): void
    {
        foreach (['vibyra-production.up.railway.app', 'www.vibyra.net'] as $host) {
            foreach (['/privacy/requests?topic=support', '/account/delete'] as $path) {
                $this->get('https://'.$host.$path)->assertStatus(301)
                    ->assertRedirect('https://vibyra.net'.$path);
            }
        }
    }
}
