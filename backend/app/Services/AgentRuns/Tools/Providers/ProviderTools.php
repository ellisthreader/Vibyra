<?php

namespace App\Services\AgentRuns\Tools\Providers;

/**
 * One provider's Agent V2 tools. Separate from the ordinary-chat `Connector` so the
 * broker gets typed outcomes, pagination and receipts without changing chat.
 *
 * `run` returns `['result' => array, 'summary' => string, 'resourceId' => ?string,
 * 'url' => ?string, 'idempotencyKey' => ?string]` for a confirmed outcome and
 * throws `ToolFailure` / `ReconnectRequired` otherwise. `validate` aborts 422.
 */
interface ProviderTools
{
    /** @return array<string, 'read'|'write'> */
    public function tools(): array;

    /** The function body offered to the model: name, description, parameters. */
    public function definition(string $tool): array;

    public function validate(string $tool, array $arguments): array;

    /** `$key` is stable for one action (its ID); providers that support idempotency derive their key from it. */
    public function run(string $tool, array $arguments, string $credential, string $key): array;

    /**
     * After an unknown write, one read-only check for the exact approved change.
     * Returns the confirmed outcome when found, or null to leave it unknown. Never re-sends.
     */
    public function reconcile(string $tool, array $arguments, string $credential, string $key): ?array;
}
