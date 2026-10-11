<?php
namespace App\Services\AgentBrowser;

use App\Models\AgentV2\ToolAction;
use App\Services\AgentRuns\{Canonical, SafeUrl};
use App\Services\AgentRuns\Browser\{BrowserOrigins, BrowserReceipts};
use App\Services\AgentRuns\Tools\Executor;

/** An attempted upload can never become a retryable read or an unverified success. */
final class UploadReceipts
{
    public function record(ToolAction $action, array $result, string $key): void
    {
        $args = $action->arguments;
        $observed = $result['observed'] ?? [];
        $readable = is_string($result['error'] ?? null) && strlen($result['error']) <= 500
            && in_array($result['reason'] ?? '', BrowserReceipts::REASONS, true)
            && array_diff(array_keys($result), ['error', 'reason', 'unknown']) === [];
        $confirmed = !isset($result['error']) && ($result['uploaded'] ?? false) === true
            && ($result['destination'] ?? null) === $args['destination']
            && ($result['pageFingerprint'] ?? null) === $args['pageFingerprint']
            && ($result['url'] ?? null) === $args['pageUrl']
            && Canonical::hash($result['file'] ?? []) === Canonical::hash($args['file'])
            && ($observed['method'] ?? null) === 'POST' && ($observed['destination'] ?? null) === $args['destination']
            && is_int($observed['status'] ?? null) && $observed['status'] >= 200 && $observed['status'] < 300;
        $state = $confirmed ? 'completed' : ($readable && ($result['unknown'] ?? false) === false ? 'failed' : 'unknown');
        $outcome = $confirmed ? 'confirmed' : ($state === 'failed' ? 'refused' : 'outcome_unknown');
        $url = SafeUrl::page($args['destination']);
        $clean = $confirmed ? ['uploaded' => true, 'file' => $args['file'], 'destination' => $url,
            'url' => SafeUrl::page($args['pageUrl']), 'pageFingerprint' => $args['pageFingerprint'],
            'observed' => ['method' => 'POST', 'destination' => $url, 'status' => $observed['status']]]
            : ['outcome' => $outcome, 'reason' => $state === 'failed' ? $result['reason'] : 'outcome_unknown',
                'error' => $readable ? $result['error'] : 'The upload could not be confirmed. Check the site before trying again.'];
        app(Executor::class)->finish($action, $state, $confirmed ? 'confirmed' : ($state === 'failed' ? 'failed' : 'unknown'),
            $outcome, $clean, $confirmed ? 'Uploaded '.$args['file']['name'].' to '.BrowserOrigins::ofUrl($args['destination'])
                : ($state === 'failed' ? 'Upload refused' : 'Upload outcome unconfirmed'),
            ['resourceId' => $args['file']['sha256'], 'url' => $url, 'idempotencyKey' => $key]);
    }
}
