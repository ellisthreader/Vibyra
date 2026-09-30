<?php

namespace App\Services\AgentRuns\Browser;

use App\Models\AgentV2\{Connection, ToolAction};
use App\Services\AgentRuns\SafeUrl;
use App\Services\AgentRuns\Tools\Executor;

/**
 * Validates one Mac browser receipt and records it. Receipts carry the final URL,
 * page title and pageFingerprint. Secret field values are scrubbed again here,
 * whatever the Mac sent, and URLs lose fragments and tokens (`SafeUrl`). Submit
 * receipts are judged by `BrowserSubmitReceipts`: a refusal before submitting is
 * `failed`, anything unverifiable after the click is `unknown`.
 */
final class BrowserReceipts
{
    public const REASONS = ['page_changed', 'origin_blocked', 'paused', 'busy', 'unavailable', 'refused', 'not_found', 'timeout', 'not_submitted'];

    public function __construct(private readonly Executor $executor, private readonly BrowserSubmitReceipts $submits) {}

    public function record(ToolAction $action, array $result, string $key): void
    {
        // A submit may already have sent the form: its receipt is judged separately and never answered with a refusal (F-10).
        if ($action->tool === 'browser_submit') { $this->submits->record($action, $result, $key); return; }
        abort_if(strlen(json_encode($result)) > (int) config('agents_v2_browser.max_receipt_bytes', 30000), 422, 'Browser receipt is too large.');
        $error = $result['error'] ?? null;
        if ($error !== null) {
            $reason = $result['reason'] ?? 'refused';
            abort_unless(is_string($error) && strlen($error) <= 500 && in_array($reason, self::REASONS, true)
                && array_diff(array_keys($result), ['error', 'reason', 'unknown']) === [], 422, 'Invalid browser refusal.');
            $this->finish($action, 'failed', ['error' => $error, 'outcome' => 'refused', 'reason' => $reason], mb_substr($error, 0, 255), $key);
            return;
        }
        $result = self::scrub($result);
        $url = $result['url'] ?? null;
        abort_unless(is_string($url) && strlen($url) <= 2048, 422, 'A browser receipt names the page URL.');
        $fp = $result['pageFingerprint'] ?? null;
        abort_unless($fp === null || (is_string($fp) && preg_match('/\A[a-f0-9]{64}\z/D', $fp)), 422, 'Invalid page fingerprint.');
        $origins = Connection::query()->whereKey($action->connection_id)->value('scopes');
        $origins = is_string($origins) ? json_decode($origins, true) : $origins;
        abort_unless($url === 'about:blank' || in_array(BrowserOrigins::ofUrl($url), (array) $origins, true), 422,
            'The browser reported a page outside the granted sites.');
        $url = $result['url'] = (string) SafeUrl::page($url); // F-09: stored, journalled and shown without fragment or tokens
        $summary = match ($action->tool) {
            'browser_open' => 'Opened '.BrowserOrigins::ofUrl($url),
            'browser_takeover_request' => 'The person finished in the browser',
            'browser_read' => 'Read the page',
            default => 'Browser: '.mb_substr((string) ($result['title'] ?? ''), 0, 120),
        };
        $this->finish($action, 'completed', $result, $summary, $key, $url, $fp);
    }

    /** Password, hidden and secret-flagged field values never reach the model or the journal. */
    public static function scrub(array $result): array
    {
        foreach (['forms', 'elements'] as $list) {
            if (!is_array($result[$list] ?? null)) continue;
            foreach ($result[$list] as $i => $item) {
                if (!is_array($item)) continue;
                if ($list === 'elements' && BrowserBinding::secret($item) && isset($item['value'])) $result[$list][$i]['value'] = '[hidden]';
                foreach (is_array($item['fields'] ?? null) ? $item['fields'] : [] as $j => $field)
                    if (is_array($field) && BrowserBinding::secret($field)) $result[$list][$i]['fields'][$j]['value'] = '[hidden]';
            }
        }
        return $result;
    }

    private function finish(ToolAction $action, string $state, array $result, string $summary, string $key,
        ?string $url = null, ?string $resource = null): void
    {
        $status = match ($state) { 'completed' => 'confirmed', 'unknown' => 'unknown', default => 'failed' };
        $outcome = $state === 'completed' ? 'confirmed' : ($result['outcome'] ?? 'refused');
        $this->executor->finish($action, $state, $status, $outcome, $result, $summary,
            ['resourceId' => $resource, 'url' => $url, 'idempotencyKey' => $key]);
    }
}
