<?php

namespace App\Services\AgentRuns\Drafts;

use App\Models\AgentV2\Run;
use App\Services\AgentRuns\Tools\{Manifest, ToolRefused};

/** Changing From selects an already admitted Gmail account, never grants a new one or accepts a spoofed address. */
final class DraftSenders
{
    public function authorize(Run $run, string $id): array
    {
        [$grant, $connection] = app(Manifest::class)->authorize($run, 'gmail_send', $id);
        $pinned = collect($run->grant_snapshot ?? [])->firstWhere('connectionId', $id);
        if (!$pinned || (int) $pinned['revision'] !== $grant->revision || (int) $pinned['generation'] !== $connection->generation)
            throw new ToolRefused('draft_access_changed', 'This sender’s access changed. Start a new task.');
        if (!filter_var($connection->external_identity, FILTER_VALIDATE_EMAIL))
            throw new ToolRefused('sender_unknown', 'Reconnect this Gmail account to verify its sender address.');
        return [$grant, $connection];
    }

    public function choices(Run $run): array
    {
        $out = [];
        foreach ($run->grant_snapshot ?? [] as $pinned) {
            if (!in_array('gmail_send', $pinned['operations'] ?? [], true)) continue;
            try { [, $connection] = $this->authorize($run, $pinned['connectionId']); }
            catch (ToolRefused) { continue; }
            $out[] = ['connectionId' => $connection->id, 'account' => $connection->external_identity];
        }
        return $out;
    }
}
