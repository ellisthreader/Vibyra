<?php

namespace App\Services\AgentRuns\Browser;

use App\Models\AgentV2\{Connection, ToolAction};
use App\Services\AgentRuns\{SafeUrl};
use App\Services\AgentRuns\Tools\Executor;

/**
 * The Mac's receipt for an approved form submit (F-10). A click may already have sent the form, so the server never
 * answers a receipt with a refusal it cannot stand behind: anything it cannot verify is `outcome_unknown` (never
 * retried, the person checks the site). `submitted: true` counts only with `observed`, the request the Mac's own
 * network interception saw leave for the approved destination with the approved method. `submitted: false` with no
 * observed request is a definite "nothing was sent", which the model may propose again (it needs a fresh approval).
 */
final class BrowserSubmitReceipts
{
    public function __construct(private readonly Executor $executor) {}

    public function record(ToolAction $action, array $result, string $key): void
    {
        if (isset($result['error'])) { $this->refusal($action, $result, $key); return; }
        $observed = $result['observed'] ?? null;
        if (($result['submitted'] ?? null) === false && empty($observed)) {
            $this->finish($action, 'failed', ['error' => 'The form was not sent: the button did nothing.', 'outcome' => 'refused', 'reason' => 'not_submitted'],
                'The form was not sent', $key);
            return;
        }
        $clean = ($result['submitted'] ?? null) === true ? $this->verified($action, $result) : null;
        if ($clean === null) {
            $this->finish($action, 'unknown', ['error' => 'The Mac reported a form submit that Vibyra could not verify. Check the site before trying again.',
                'outcome' => 'outcome_unknown'], 'Submit outcome unconfirmed', $key);
            return;
        }
        $shot = $clean['screenshotSha256'] ?? null;
        $this->finish($action, 'completed', $clean, 'Submitted a form to '.BrowserOrigins::ofUrl($action->arguments['destination']), $key,
            $clean['url'], $shot ?? ($clean['pageFingerprint'] ?? null));
    }

    /** Only the Mac's definite "I refused before submitting" is a failure; an unreadable one or an error after the click is unknown. */
    private function refusal(ToolAction $action, array $result, string $key): void
    {
        $reason = $result['reason'] ?? 'refused';
        $readable = is_string($result['error']) && strlen($result['error']) <= 500 && in_array($reason, BrowserReceipts::REASONS, true)
            && array_diff(array_keys($result), ['error', 'reason', 'unknown']) === [];
        if (!$readable || ($result['unknown'] ?? false) === true) {
            $this->finish($action, 'unknown', ['error' => ($readable ? $result['error'] : 'The Mac\'s answer could not be read.').' Check the site before trying again.',
                'outcome' => 'outcome_unknown'], 'Submit outcome unconfirmed', $key);
            return;
        }
        $this->finish($action, 'failed', ['error' => $result['error'], 'outcome' => 'refused', 'reason' => $reason], mb_substr($result['error'], 0, 255), $key);
    }

    /** The receipt, cleaned for storage, when every claim in it checks out; null when any does not. */
    private function verified(ToolAction $action, array $result): ?array
    {
        $args = $action->arguments ?? [];
        $url = $result['url'] ?? null;
        $observed = $result['observed'] ?? null;
        $hash = fn ($v) => $v === null || (is_string($v) && preg_match('/\A[a-f0-9]{64}\z/D', $v));
        if (strlen(json_encode($result)) > (int) config('agents_v2_browser.max_receipt_bytes', 30000)
            || !is_string($url) || strlen($url) > 2048 || !$hash($result['pageFingerprint'] ?? null) || !$hash($result['screenshotSha256'] ?? null)
            || ($result['destination'] ?? null) !== ($args['destination'] ?? '') || !is_array($observed)
            || ($observed['method'] ?? null) !== ($args['method'] ?? '') || ($observed['destination'] ?? null) !== $args['destination']) return null;
        $origins = Connection::query()->whereKey($action->connection_id)->value('scopes');
        $origins = is_string($origins) ? json_decode($origins, true) : $origins;
        if ($url !== 'about:blank' && !in_array(BrowserOrigins::ofUrl($url), (array) $origins, true)) return null;
        return BrowserReceipts::scrub([...$result, 'url' => (string) SafeUrl::page($url)]);
    }

    private function finish(ToolAction $action, string $state, array $result, string $summary, string $key, ?string $url = null, ?string $resource = null): void
    {
        $status = match ($state) { 'completed' => 'confirmed', 'unknown' => 'unknown', default => 'failed' };
        $this->executor->finish($action, $state, $status, $state === 'completed' ? 'confirmed' : $result['outcome'], $result, $summary,
            ['resourceId' => $resource, 'url' => $url, 'idempotencyKey' => $key]);
    }
}
