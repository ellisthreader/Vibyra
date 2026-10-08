<?php

namespace Tests\Feature;

use App\Models\{AccountAuditEvent, User};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Support\{SharingFixture, SharingLinkHelpers};
use Tests\TestCase;

/** Part 17: the read-only page behind a share link (noindex, strict policy, no third-party loads, escaped text, redaction, the activity log). */
class SharingLinksPageTest extends TestCase
{
    use RefreshDatabase, SharingFixture, SharingLinkHelpers;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootLinks();
    }

    public function test_the_page_is_read_only_noindex_cookieless_and_loads_nothing_from_anywhere_else(): void
    {
        [, $token] = $this->share();
        $r = $this->page($token)->assertOk();
        $r->assertSee('Please review the login change.')->assertSee('Looks fine. One nit on naming.')->assertSee('Shared from Vibyra');
        $r->assertHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')->assertHeader('Referrer-Policy', 'no-referrer');
        $this->assertStringContainsString('no-store', $r->headers->get('Cache-Control'));
        $this->assertStringContainsString('name="robots" content="noindex', $r->getContent());
        $csp = $r->headers->get('Content-Security-Policy');
        $this->assertStringContainsString("default-src 'none'", $csp);
        $this->assertStringNotContainsString('script-src', $csp);
        $this->assertStringNotContainsString('http', str_replace(["'self'"], '', $csp));
        $this->assertStringContainsString("frame-ancestors 'none'", $csp);
        $this->assertMatchesRegularExpression("/style-src 'nonce-[A-Za-z0-9+\\/=]+'/", $csp);
        $this->assertSame('DENY', $r->headers->get('X-Frame-Options'));
        $this->assertEmpty($r->headers->getCookies(), 'No session or tracking cookie.');
        $html = $r->getContent();
        $this->assertStringNotContainsString('<script', $html);
        $this->assertDoesNotMatchRegularExpression('/\b(src|href|action)="https?:\/\/(?!'.preg_quote(parse_url(url('/'), PHP_URL_HOST), '/').')/i', $html);
        $this->assertDoesNotMatchRegularExpression('/@import|url\(\s*[\'"]?https?:/i', $html);
        foreach (['analytics', 'gtag', 'plausible', 'turnstile', 'googletagmanager', 'fonts.g'] as $word) $this->assertStringNotContainsStringIgnoringCase($word, $html);
        preg_match("/nonce-([^']+)'/", $csp, $m);
        $this->assertStringContainsString('nonce="'.$m[1].'"', $html);
    }

    public function test_the_page_escapes_what_it_shows(): void
    {
        $this->finishedRun($this->agent, '<script>alert(1)</script> <img src=x onerror=alert(2)>', '[click](javascript:alert(3))');
        [, $token] = $this->share();
        $html = $this->page($token)->assertOk()->getContent();
        $this->assertStringNotContainsString('<script>alert(1)', $html);
        $this->assertStringNotContainsString('<img src=x', $html);
        $this->assertStringContainsString('&lt;script&gt;alert(1)&lt;/script&gt;', $html);
        $this->assertStringNotContainsString('href="javascript', $html);
    }

    public function test_every_dead_token_looks_the_same(): void
    {
        [$r, $revoked] = $this->share();
        $this->deleteJson('/api/sharing/links/'.$r->json('link.id'))->assertOk();
        $bodies = [];
        foreach ([$revoked, Str::random(43), 'short', str_repeat('a', 300), 'a.b.c', strtr(Str::random(43), 'a', '+')] as $token) {
            $res = $this->page($token);
            $res->assertNotFound()->assertHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
            $bodies[] = preg_replace('/nonce="[^"]+"/', '', preg_replace("/nonce-[^']+/", '', $res->getContent()));
        }
        $this->assertCount(1, array_unique($bodies));
        $this->assertStringNotContainsString('revoked', strtolower($bodies[0]));
        $this->assertStringNotContainsString('expired', str_replace('It may have expired', '', $bodies[0]));
    }

    public function test_secrets_are_redacted_by_default_in_the_preview_the_store_and_the_page(): void
    {
        $this->finishedRun($this->agent, 'Deploy with '.self::KEY.' please.', "Done. Set API_KEY=".self::KEY." in the env.");
        $p = $this->preview()->assertOk()->json('preview');
        $this->assertGreaterThanOrEqual(2, $p['redactions']);
        $this->assertStringNotContainsString(self::KEY, json_encode($p));
        [$r, $token] = $this->share();
        $this->assertGreaterThanOrEqual(2, $r->json('link.redactions'));
        $this->assertStringNotContainsString(self::KEY, json_encode((array) DB::table('shared_links')->first()));
        $html = $this->page($token)->assertOk()->getContent();
        $this->assertStringNotContainsString(self::KEY, $html);
        $this->assertStringContainsString('[redacted:', $html);
        $this->assertStringContainsString('Secrets such as keys and tokens were removed', $html);
        // A request cannot switch the guard off.
        $hash = $this->preview(['redact' => false])->assertOk()->json('preview.snapshotHash');
        $this->assertSame($p['snapshotHash'], $hash);
    }

    public function test_activity_records_creation_and_revoking_without_content_or_token(): void
    {
        $this->finishedRun($this->agent, 'My private question.', 'My private answer.');
        [$r, $token] = $this->share();
        $this->deleteJson('/api/sharing/links/'.$r->json('link.id'))->assertOk();
        $events = AccountAuditEvent::orderBy('id')->get();
        $this->assertSame(['share.created', 'share.revoked'], $events->pluck('event')->all());
        $this->assertSame(['conversation', 7], [$events[0]->detail['kind'], (int) $events[0]->detail['days']]);
        $blob = json_encode($events->map->only(['event', 'detail'])->all());
        foreach ([$token, 'private', $r->json('link.id')] as $forbidden) $this->assertStringNotContainsString($forbidden, $blob);
    }
}
