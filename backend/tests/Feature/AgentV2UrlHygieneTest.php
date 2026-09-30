<?php

namespace Tests\Feature;

use App\Services\AgentRuns\SafeUrl;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\{AgentV2BrowserFixture, AgentV2Fixture};
use Tests\TestCase;

/** F-09 (security review 2026-09-30): a page or provider URL never carries a fragment, userinfo or token into the journal, receipts or the model. */
class AgentV2UrlHygieneTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2BrowserFixture;

    private const SECRET = 'ya29.A0ARrdaM-SECRET_token_value_1234567890';

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
    }

    public function test_the_sanitizer_drops_fragments_userinfo_and_token_parameters_but_keeps_ordinary_links(): void
    {
        $cases = [
            'https://shop.example.com/cb#access_token='.self::SECRET.'&state=x' => 'https://shop.example.com/cb',
            'https://user:hunter2@shop.example.com/x?q=ok&token=abc123#top' => 'https://shop.example.com/x?q=ok',
            'https://s3.example.com/f?X-Amz-Signature=deadbeef&X-Amz-Credential=AKIA%2F2026&page=2' => 'https://s3.example.com/f?page=2',
            'https://shop.example.com/i?id_token=eyJabc.def.ghi&k=v' => 'https://shop.example.com/i?k=v',
            'https://shop.example.com/i?ref=3f9a8c1d2e4b5a6978c0d1e2f3a4b5c6&page=3' => 'https://shop.example.com/i?page=3',
            'https://shop.example.com/i?file=quarterly-report-2026-final-version&page=3' => 'https://shop.example.com/i?file=quarterly-report-2026-final-version&page=3',
            'https://mail.google.com/mail/u/0/#sent/FMfcgzQbcd' => 'https://mail.google.com/mail/u/0/#sent/FMfcgzQbcd',
            'https://mail.google.com/mail/u/0/#inbox?token=abc' => 'https://mail.google.com/mail/u/0/',
            'https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#heading=h.x' => 'https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit',
            'https://github.com/o/r/issues/7#issuecomment-99' => 'https://github.com/o/r/issues/7#issuecomment-99',
            'https://github.com/o/r/issues/7#access_token='.self::SECRET => 'https://github.com/o/r/issues/7',
            'javascript:alert(1)' => null, 'ftp://host/file' => null, 'not a url' => null,
        ];
        foreach ($cases as $raw => $clean) $this->assertSame($clean, SafeUrl::clean($raw), $raw);
        $this->assertSame('https://app.example.com/verify/[redacted]?x=1', SafeUrl::page('https://app.example.com/verify/3f9a8c1d2e4b5a6978c0d1e2f3a4b5c6?x=1#t'));
        $this->assertSame('https://app.example.com/a/eyJhbGciOi.eyJzdWIi.sig?x=1', SafeUrl::clean('https://app.example.com/a/eyJhbGciOi.eyJzdWIi.sig?x=1&jwt=eyJ'));
        $this->assertSame('https://app.example.com/a/[redacted]', SafeUrl::page('https://app.example.com/a/eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl'));
        $this->assertSame('about:blank', SafeUrl::page('about:blank'));
        $this->assertSame(['url' => 'https://h.example/x', 'note' => 'https://h.example/y#z', 'nested' => [['webViewLink' => 'https://h.example/d']]],
            SafeUrl::scrub(['url' => 'https://h.example/x#a=b', 'note' => 'https://h.example/y#z', 'nested' => [['webViewLink' => 'https://h.example/d#q']]]));
    }

    public function test_a_browser_receipt_url_never_reaches_the_model_the_journal_or_the_receipt_with_its_token(): void
    {
        $conn = $this->bootBrowser();
        $this->admit('Open the shop.');
        $claimed = $this->claim();
        $open = $this->callTool($claimed, 'browser_open', $conn, ['url' => 'https://shop.example.com/contact'], 'o2')->assertOk()->json('action');
        $this->browserClaim($claimed, $open)->assertOk();
        $dirty = 'https://shop.example.com/fragment?token=abc&ok=1#access_token='.self::SECRET;
        $done = $this->browserReceipt($claimed, $open['id'], ['url' => $dirty] + $this->page(str_repeat('a', 64)))->assertOk()->json('action');
        $this->assertSame('https://shop.example.com/fragment?ok=1', $done['result']['url']);
        $this->assertSame('https://shop.example.com/fragment?ok=1', $done['receipt']['url']);
        foreach (['agent_tool_actions' => 'result', 'agent_receipts' => 'provider_url', 'agent_run_events' => 'payload'] as $table => $column) {
            $this->assertStringNotContainsString('SECRET_token', implode("\n", DB::table($table)->pluck($column)->all()), $table);
            $this->assertStringNotContainsString('access_token', implode("\n", DB::table($table)->pluck($column)->all()), $table);
        }
        $this->getJson($this->runnerPath('/runs/'.$claimed['id'].'/actions/'.$open['id'].'?generation='.$claimed['generation']), $this->runnerHeaders())
            ->assertOk()->assertJsonPath('action.result.url', 'https://shop.example.com/fragment?ok=1');
    }
}
