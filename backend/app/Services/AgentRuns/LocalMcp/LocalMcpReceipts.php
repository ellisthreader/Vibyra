<?php

namespace App\Services\AgentRuns\LocalMcp;

use App\Models\AgentV2\{McpServer, ToolAction};
use App\Services\AgentRuns\Tools\Executor;

/**
 * Validates one Mac receipt for a local MCP call and records it. Output is untrusted data: the text is cut to
 * 16,000 bytes (on a character boundary) and structured content over the same size is dropped, whatever the Mac sent.
 * A tool that answered `isError` is a definite failure (`tool_error`). A write the Mac sent but could not confirm
 * (`unknown: true`: timeout, crash, lost output) is `unknown` and never re-sent; a read is retryable.
 */
final class LocalMcpReceipts
{
    public const REASONS = ['tool_error', 'timeout', 'crashed', 'unavailable', 'disabled', 'too_large', 'rpc_error', 'unsupported',
        'secret', 'invalid', 'server_changed', 'not_found'];
    private const DEFINITE = ['tool_error', 'disabled', 'secret', 'invalid', 'unsupported', 'server_changed', 'not_found', 'rpc_error', 'too_large'];

    public function __construct(private readonly Executor $executor) {}

    public function record(ToolAction $action, array $result, string $key): void
    {
        abort_if(strlen((string) json_encode($result)) > (int) config('agents_v2_local_mcp.max_receipt_bytes', 65536), 422, 'The receipt is too large.');
        $name = (string) McpServer::query()->where('connection_id', $action->connection_id)->value('name');
        if (array_key_exists('error', $result)) { $this->failure($action, $result, $name, $key); return; }
        abort_unless(array_diff(array_keys($result), ['text', 'structured', 'truncated', 'isError']) === [] && is_string($result['text'] ?? null), 422,
            'A local MCP receipt carries text, optional structured content and flags.');
        $cap = (int) config('agents_v2_local_mcp.max_text_bytes', 16000);
        $text = self::clip($result['text'], $cap);
        $truncated = ($result['truncated'] ?? false) === true || strlen($result['text']) > $cap;
        $structured = $result['structured'] ?? null;
        if ($structured !== null && (!is_array($structured) || strlen((string) json_encode($structured)) > $cap)) { $structured = null; $truncated = true; }
        if (($result['isError'] ?? false) === true) {
            $message = 'The MCP tool reported an error: '.mb_substr($text !== '' ? $text : 'no detail', 0, 500);
            $this->finish($action, 'failed', 'failed', 'refused', ['error' => $message, 'outcome' => 'refused', 'reason' => 'tool_error'], mb_substr($message, 0, 255), $key);
            return;
        }
        $out = array_filter(['text' => $text, 'structured' => $structured, 'truncated' => $truncated ?: null], fn ($v) => $v !== null);
        $remote = collect(McpServer::query()->where('connection_id', $action->connection_id)->first()?->tools ?? [])->firstWhere('tool', $action->tool)['remote'] ?? $action->tool;
        $summary = mb_substr(($action->kind === 'write' ? 'Ran ' : 'Read with ').$remote.' on '.$name, 0, 255);
        $this->finish($action, 'completed', 'confirmed', 'confirmed', $out, $summary, $key);
    }

    private function failure(ToolAction $action, array $result, string $name, string $key): void
    {
        $reason = $result['reason'] ?? 'unavailable';
        abort_unless(is_string($result['error']) && strlen($result['error']) <= 500 && in_array($reason, self::REASONS, true)
            && array_diff(array_keys($result), ['error', 'reason', 'unknown']) === [], 422, 'Invalid local MCP refusal.');
        $unknown = ($result['unknown'] ?? false) === true && $action->kind === 'write';
        if ($unknown) {
            $this->finish($action, 'unknown', 'unknown', 'outcome_unknown', ['error' => $result['error'], 'outcome' => 'outcome_unknown', 'reason' => $reason],
                'Outcome not confirmed', $key);
            return;
        }
        $outcome = in_array($reason, self::DEFINITE, true) ? 'refused' : 'retryable';
        $this->finish($action, 'failed', 'failed', $outcome, ['error' => $result['error'], 'outcome' => $outcome, 'reason' => $reason,
            'retryable' => $outcome === 'retryable'], mb_substr($result['error'], 0, 255), $key);
    }

    private function finish(ToolAction $action, string $state, string $status, string $outcome, array $result, string $summary, string $key): void
    {
        $this->executor->finish($action, $state, $status, $outcome, $result, $summary, ['idempotencyKey' => $key]);
    }

    private static function clip(string $text, int $bytes): string
    {
        return strlen($text) <= $bytes ? $text : mb_strcut($text, 0, $bytes, 'UTF-8');
    }
}
