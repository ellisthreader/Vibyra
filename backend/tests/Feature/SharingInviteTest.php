<?php

namespace Tests\Feature;

use App\Models\{CreditLedger, Referral, User};
use App\Services\Referrals\ReferralService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Part 17: the /invite landing page remembers a referral code in a first-party cookie; sign-up and rewards are the existing referral rules. */
class SharingInviteTest extends TestCase
{
    use RefreshDatabase;

    private User $referrer;
    private string $code;

    protected function setUp(): void
    {
        parent::setUp();
        config(['sharing.invite' => true]);
        $this->referrer = User::factory()->create();
        $this->code = app(ReferralService::class)->ensureCode($this->referrer);
    }

    private function signup(string $email, array $extra = [], array $cookies = [])
    {
        $this->withCredentials();
        foreach ($cookies as $name => $value) $this->withCookie($name, $value);
        return $this->postJson('/web-api/auth/signup', ['name' => 'Friend', 'email' => $email, 'password' => 'secret123', ...$extra]);
    }

    private function remembered(string $code): string
    {
        // The test client encrypts a cookie it sends, so hand it the plain value the browser would hold after decrypting.
        return (string) $this->get('/invite/'.$code)->assertOk()->getCookie('vibyra_ref')?->getValue();
    }

    public function test_it_is_off_by_default(): void
    {
        config(['sharing.invite' => false]);
        $this->get('/invite/'.$this->code)->assertNotFound();
        $this->get('/invite')->assertNotFound();
    }

    public function test_the_link_the_app_hands_out_has_a_route(): void
    {
        $link = app(ReferralService::class)->summary($this->referrer)['link'];
        $this->assertSame(rtrim(config('referrals.invite_base_url'), '/').'/'.$this->code, $link);
        $this->get('/invite/'.$this->code)->assertOk();
        $this->assertSame('invite', app('router')->getRoutes()->match(\Illuminate\Http\Request::create('/invite/'.$this->code))->getName());
    }

    public function test_a_known_code_is_remembered_in_a_first_party_http_only_cookie_and_leads_to_sign_up(): void
    {
        $r = $this->get('/invite/'.strtolower($this->code))->assertOk();
        $cookie = $r->getCookie('vibyra_ref', false);
        $this->assertNotNull($cookie);
        $this->assertTrue($cookie->isHttpOnly());
        $this->assertSame('lax', $cookie->getSameSite());
        $this->assertSame('/', $cookie->getPath());
        $this->assertNull($cookie->getDomain(), 'Host-only: first party.');
        $this->assertEqualsWithDelta(time() + 30 * 86400, $cookie->getExpiresTime(), 120);
        $this->assertSame($this->code, $r->getCookie('vibyra_ref')->getValue(), 'Normalised, and encrypted in transit.');
        $this->assertNotSame($this->code, $cookie->getValue());
        $r->assertSee('A friend invited you to Vibyra')->assertSee(url('/signup?ref='.$this->code), false)->assertSee('/login', false);
        $r->assertHeader('X-Robots-Tag', 'noindex, nofollow');
        $this->assertStringNotContainsString($this->referrer->email, $r->getContent());
        $this->assertStringNotContainsString($this->referrer->name, $r->getContent());
        $this->assertStringNotContainsString('<script', $r->getContent());
    }

    public function test_unknown_malformed_or_missing_codes_show_the_same_page_and_set_nothing(): void
    {
        $pages = [];
        foreach (['/invite', '/invite/NOSUCHCD', '/invite/'.str_repeat('A', 40), '/invite/%3Cscript%3E', '/invite?ref=nothere'] as $path) {
            $r = $this->get($path)->assertOk();
            $this->assertNull($r->getCookie('vibyra_ref', false), $path);
            $pages[] = preg_replace('/nonce="[^"]+"/', '', $r->getContent());
        }
        $this->assertCount(1, array_unique($pages));
        $this->assertStringContainsString(url('/signup').'"', $pages[0]);
        $this->assertStringNotContainsString('?ref=', $pages[0]);
    }

    public function test_the_code_can_also_arrive_as_a_query(): void
    {
        $this->assertSame($this->code, $this->get('/invite?ref='.$this->code)->assertOk()->getCookie('vibyra_ref')->getValue());
    }

    public function test_sign_up_after_the_invite_page_records_the_referral_with_the_unchanged_rewards(): void
    {
        $viaCookie = $this->remembered($this->code);
        $this->signup('cookie@example.test', [], ['vibyra_ref' => $viaCookie])->assertCreated();
        $friend = User::where('email', 'cookie@example.test')->firstOrFail();
        $referral = Referral::where('referred_user_id', $friend->id)->firstOrFail();
        $this->assertSame([$this->referrer->id, $this->code], [(int) $referral->referrer_user_id, $referral->code]);
        $this->assertNotNull($referral->signup_reward_granted_at);
        // The same sign-up with the code typed into the form earns exactly what the cookie did.
        $this->flushSession();
        $this->signup('typed@example.test', ['referralCode' => $this->code])->assertCreated();
        $typed = User::where('email', 'typed@example.test')->firstOrFail();
        $ledger = fn (User $u) => CreditLedger::where('user_id', $u->id)->orderBy('id')->get(['kind', 'credits_delta'])->toArray();
        $this->assertSame($ledger($typed), $ledger($friend));
        $this->assertSame(2, Referral::where('referrer_user_id', $this->referrer->id)->count());
    }

    public function test_the_cookie_is_used_once_and_forgotten(): void
    {
        $r = $this->signup('once@example.test', [], ['vibyra_ref' => $this->remembered($this->code)])->assertCreated();
        $gone = $r->getCookie('vibyra_ref', false);
        $this->assertNotNull($gone);
        $this->assertLessThan(time(), $gone->getExpiresTime(), 'The cookie is expired on the sign-up response.');
    }

    public function test_the_form_code_wins_over_the_cookie_and_a_stale_cookie_never_blocks_sign_up(): void
    {
        $other = User::factory()->create();
        $otherCode = app(ReferralService::class)->ensureCode($other);
        $this->signup('form@example.test', ['referralCode' => $otherCode], ['vibyra_ref' => $this->remembered($this->code)])->assertCreated();
        $this->assertSame($other->id, (int) Referral::where('referred_user_id', User::where('email', 'form@example.test')->value('id'))->value('referrer_user_id'));
        // The referrer deletes their account after the visitor saw the invite page.
        $cookie = $this->remembered($this->code);
        $this->referrer->delete();
        $this->flushSession();
        $this->signup('late@example.test', [], ['vibyra_ref' => $cookie])->assertCreated();
        $this->assertSame(0, Referral::where('referred_user_id', User::where('email', 'late@example.test')->value('id'))->count());
        // A typed code that does not exist is still the existing refusal.
        $this->signup('bad@example.test', ['referralCode' => 'NOPE1234'])->assertUnprocessable();
    }

    public function test_a_forged_or_plain_cookie_does_nothing(): void
    {
        $this->signup('forged@example.test', [], ['vibyra_ref' => 'garbage'])->assertCreated();
        $this->assertSame(0, Referral::count());
        $this->flushSession();
        $this->withCredentials()->withUnencryptedCookie('vibyra_ref', $this->code);
        $this->postJson('/web-api/auth/signup', ['name' => 'F', 'email' => 'plain@example.test', 'password' => 'secret123'])->assertCreated();
        $this->assertSame(0, Referral::count(), 'An unencrypted cookie is not trusted: the browser only ever holds the encrypted one.');
    }

    public function test_with_the_page_off_a_remembered_code_is_ignored(): void
    {
        $cookie = $this->remembered($this->code);
        config(['sharing.invite' => false]);
        $this->signup('off@example.test', [], ['vibyra_ref' => $cookie])->assertCreated();
        $this->assertSame(0, Referral::count());
    }
}
