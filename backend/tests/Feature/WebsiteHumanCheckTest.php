<?php

namespace Tests\Feature;

use App\Http\Middleware\VerifyHuman;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class WebsiteHumanCheckTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config()->set('services.turnstile.enabled', true);
        config()->set('services.turnstile.site_key', 'site-key');
        config()->set('services.turnstile.secret_key', 'secret-key');
        $this->withoutMiddleware(PreventRequestForgery::class);
    }

    public function test_first_visit_gets_the_check_page(): void
    {
        $this->get('/downloads')
            ->assertForbidden()
            ->assertHeader('X-Robots-Tag', 'noindex, nofollow')
            ->assertSee("Checking you're human", false)
            ->assertSee('data-sitekey="site-key"', false)
            ->assertSee('value="/downloads"', false);
    }

    public function test_verified_visitor_goes_straight_through(): void
    {
        $this->withCookie(VerifyHuman::COOKIE, '1')->get('/downloads')->assertOk();

    }

    public function test_unverified_crawler_names_do_not_bypass_the_gate(): void
    {
        foreach (['Googlebot', 'bingbot', 'Applebot', 'Twitterbot', 'Discordbot'] as $agent) {
            $this->withHeader('User-Agent', $agent)->get('/downloads')->assertForbidden();
        }
    }

    public function test_browser_mutations_need_a_human_cookie_even_with_a_crawler_name(): void
    {
        foreach (['/web-api/auth/signup', '/web-api/auth/login', '/web-api/phone-waitlist', '/web-api/faq/ask'] as $url) {
            $this->withHeader('User-Agent', 'Googlebot')->postJson($url, [])->assertForbidden()
                ->assertJsonPath('code', 'human_check_required');
        }
    }

    public function test_legal_pages_and_disabled_check_are_not_gated(): void
    {
        $this->get('/legal/privacy')->assertOk();

        config()->set('services.turnstile.secret_key', null);
        $this->get('/downloads')->assertOk();
    }

    public function test_passing_token_sets_cookie_and_returns_to_the_page(): void
    {
        Http::fake(['challenges.cloudflare.com/*' => Http::response(['success' => true])]);

        $this->post('/web-api/human-check', ['cf-turnstile-response' => 'token', 'return_to' => '/benchmarks'])
            ->assertRedirect('/benchmarks')
            ->assertCookie(VerifyHuman::COOKIE, '1');

        Http::assertSent(fn ($request) => $request['secret'] === 'secret-key' && $request['response'] === 'token');
    }

    public function test_failed_token_returns_to_the_check_with_an_error(): void
    {
        Http::fake(['challenges.cloudflare.com/*' => Http::response(['success' => false])]);

        $this->post('/web-api/human-check', ['cf-turnstile-response' => 'bad', 'return_to' => '/signup'])
            ->assertRedirect('/signup?check_failed=1')
            ->assertCookieMissing(VerifyHuman::COOKIE);
    }

    public function test_return_path_cannot_leave_the_site(): void
    {
        Http::fake(['challenges.cloudflare.com/*' => Http::response(['success' => true])]);

        foreach (['https://evil.test', '//evil.test', '/\\evil.test'] as $target) {
            $this->post('/web-api/human-check', ['cf-turnstile-response' => 'token', 'return_to' => $target])
                ->assertRedirect('/');
        }
    }
}
