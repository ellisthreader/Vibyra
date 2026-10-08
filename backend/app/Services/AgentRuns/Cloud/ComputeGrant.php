<?php
namespace App\Services\AgentRuns\Cloud;

use App\Models\{AgentV2\RuntimeBinding, VibyraSession};

/** Internal capability, not an HTTP field. Wake rechecks saved authority under its owner lock. */
final readonly class ComputeGrant
{
    private function __construct(private string $bindingId, private int $revision, private string $workspaceId) {}

    public static function fromPolicy(RuntimeBinding $b, object $w): self
    {
        $p = app(Policies::class)->current($b);
        abort_unless($p->workspace_id === $w->id, 409, 'Cloud workspace changed.');
        return new self($b->id, $p->revision, $w->id);
    }

    public function accept(VibyraSession $s, object $w): array
    {
        $b = RuntimeBinding::findOrFail($this->bindingId);
        $p = app(Policies::class)->current($b);
        abort_unless($b->user_id === $s->user_id && $p->session_id === $s->id && $p->revision === $this->revision
            && $w->id === $this->workspaceId && $w->id === $p->workspace_id, 409, 'Cloud Agent authority changed.');
        $q = json_decode($p->quote, true, 32, JSON_THROW_ON_ERROR);
        app(Policies::class)->samePrice($q, $w);
        $seconds = min($q['deadlineSeconds'], (int) now()->diffInSeconds($p->expires_at, false));
        abort_unless($seconds >= 1, 409, 'Cloud Agent authority expired.');
        return [...$q, 'deadlineSeconds' => $seconds];
    }
}
