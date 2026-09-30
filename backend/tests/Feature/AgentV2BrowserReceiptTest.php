<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\{AgentV2BrowserFixture, AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/** F-10 (security review 2026-09-30): a submit receipt is believed only as far as the Mac can prove it; after a real POST, doubt is `outcome_unknown`. */
class AgentV2BrowserReceiptTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes, AgentV2BrowserFixture;

    private array $claimed;
    private string $conn;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
    }

    /** A claimed (dispatching) submit of the contact form, as the Mac holds it when it clicks. */
    private function dispatchedSubmit(string $call): array
    {
        if (!isset($this->claimed)) { $this->conn = $this->bootBrowser(); $this->admit('Send the contact form.'); $this->claimed = $this->claim(); }
        $conn = $this->conn;
        $fp = hash('sha256', $call); // a different form each time: an identical unknown submit is never re-prepared
        $snap = $this->callTool($this->claimed, 'browser_snapshot', $conn, [], 's-'.$call)->json('action');
        $this->browserRun($this->claimed, $snap, $this->page($fp))->assertOk();
        $submit = $this->callTool($this->claimed, 'browser_submit', $conn, ['ref' => 'e3', 'pageFingerprint' => $fp], 'w-'.$call)->json('action');
        $this->decide($submit)->assertOk();
        $this->browserClaim($this->claimed, $submit)->assertOk()->assertJsonPath('action.state', 'dispatching');
        return $submit;
    }

    private function receipt(array $submit, array $over = [])
    {
        return $this->browserReceipt($this->claimed, $submit['id'], [...['url' => 'https://shop.example.com/sent', 'title' => 'Sent', 'submitted' => true,
            'destination' => 'https://shop.example.com/send', 'observed' => ['method' => 'POST', 'destination' => 'https://shop.example.com/send']], ...$over]);
    }

    public function test_a_receipt_that_cannot_be_verified_after_a_real_submit_is_unknown_never_a_refusal(): void
    {
        foreach ([
            'wrong destination' => ['destination' => 'https://shop.example.com/other', 'observed' => ['method' => 'POST', 'destination' => 'https://shop.example.com/other']],
            'final URL too long' => ['url' => 'https://shop.example.com/sent?'.str_repeat('a=b&', 700)],
            'page outside the granted sites' => ['url' => 'https://evil.example.net/landing'],
            'malformed fingerprint' => ['pageFingerprint' => 'not-a-hash'],
            'huge receipt' => ['title' => str_repeat('x', 40000)],
        ] as $why => $over) {
            $submit = $this->dispatchedSubmit(md5($why));
            $this->receipt($submit, $over)->assertOk()->assertJsonPath('action.state', 'unknown')->assertJsonPath('action.result.outcome', 'outcome_unknown');
            $this->assertStringContainsString('Check the site', $this->getJson($this->runnerPath('/runs/'.$this->claimed['id'].'/actions/'.$submit['id']
                .'?generation='.$this->claimed['generation']), $this->runnerHeaders())->json('action.result.error'), $why);
        }
        $this->assertSame(5, DB::table('agent_receipts')->where('status', 'unknown')->count());
    }

    public function test_submitted_is_only_confirmed_by_the_request_the_mac_observed(): void
    {
        $missing = $this->dispatchedSubmit('a');
        $this->receipt($missing, ['observed' => null])->assertOk()->assertJsonPath('action.state', 'unknown');
        $wrongMethod = $this->dispatchedSubmit('b');
        $this->receipt($wrongMethod, ['observed' => ['method' => 'GET', 'destination' => 'https://shop.example.com/send']])->assertOk()->assertJsonPath('action.state', 'unknown');
        $elsewhere = $this->dispatchedSubmit('c');
        $this->receipt($elsewhere, ['observed' => ['method' => 'POST', 'destination' => 'https://shop.example.com/else']])->assertOk()->assertJsonPath('action.state', 'unknown');
        $ok = $this->dispatchedSubmit('d');
        $this->receipt($ok)->assertOk()->assertJsonPath('action.state', 'completed')->assertJsonPath('action.receipt.status', 'confirmed');
    }

    public function test_a_click_that_sent_nothing_is_a_definite_not_submitted_that_may_be_proposed_again(): void
    {
        $submit = $this->dispatchedSubmit('n');
        $this->receipt($submit, ['submitted' => false, 'observed' => null])->assertOk()
            ->assertJsonPath('action.state', 'failed')->assertJsonPath('action.result.outcome', 'refused')->assertJsonPath('action.result.reason', 'not_submitted');
    }

    /** F-28: a chunked request has no Content-Length header, so the bound is also checked on the body actually received. */
    public function test_an_oversized_receipt_is_refused_even_without_a_content_length_header(): void
    {
        $submit = $this->dispatchedSubmit('big');
        $body = json_encode(['generation' => $this->claimed['generation'], 'result' => ['title' => str_repeat('x', 70000)]]);
        $request = \Illuminate\Http\Request::create($this->browserPath($this->claimed, '/'.$submit['id'].'/receipt'), 'POST', [], [], [], ['CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json', 'HTTP_X_VIBYRA_RUNNER_KEY' => $this->runtime['runnerKey']], $body);
        $request->headers->remove('Content-Length');
        $request->server->remove('CONTENT_LENGTH');
        $this->assertSame(413, app(\Illuminate\Contracts\Http\Kernel::class)->handle($request)->getStatusCode());
    }

    /** F-06 (server half): an approval card never shows less of a form than it sends, so a form past the field cap is refused, not truncated. */
    public function test_a_form_with_more_fields_than_the_approval_can_show_is_refused(): void
    {
        $conn = $this->bootBrowser();
        $this->admit('Send the big form.');
        $claimed = $this->claim();
        $fp = str_repeat('e', 64);
        $page = $this->page($fp);
        $page['forms'][0]['fields'] = array_map(fn ($i) => ['ref' => 'f'.$i, 'name' => 'f'.$i, 'label' => 'F'.$i, 'type' => 'text', 'value' => 'v'], range(1, 31));
        $snap = $this->callTool($claimed, 'browser_snapshot', $conn, [], 's-big')->json('action');
        $this->browserRun($claimed, $snap, $page)->assertOk();
        $this->callTool($claimed, 'browser_submit', $conn, ['ref' => 'e3', 'pageFingerprint' => $fp], 'w-big')->assertOk()
            ->assertJsonPath('action.state', 'refused')->assertJsonPath('action.result.reason', 'invalid_arguments');
    }

    public function test_the_macs_own_refusals_keep_their_meaning(): void
    {
        $before = $this->dispatchedSubmit('x');
        $this->browserReceipt($this->claimed, $before['id'], ['error' => 'The page changed since it was approved.', 'reason' => 'page_changed'])->assertOk()
            ->assertJsonPath('action.state', 'failed');
        $after = $this->dispatchedSubmit('y');
        $this->browserReceipt($this->claimed, $after['id'], ['error' => 'Chrome closed after the click.', 'reason' => 'unavailable', 'unknown' => true])
            ->assertOk()->assertJsonPath('action.state', 'unknown');
    }
}
