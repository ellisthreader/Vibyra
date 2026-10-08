<?php

namespace Tests\Support;

/** Part 17 share-link helpers: a teammate with one finished run, and preview / confirm / view calls. Use after `bootSharing()`. */
trait SharingLinkHelpers
{
    private const KEY = 'AKIAJ3Q7ZB5N2XWV4LTR';
    private array $agent;

    protected function bootLinks(): void
    {
        $this->bootSharing();
        $this->agent = $this->teammate('Reviewer');
        $this->finishedRun($this->agent, 'Please review the login change.', 'Looks fine. One nit on naming.');
    }

    private function source(array $over = []): array
    {
        return ['kind' => 'conversation', 'agentId' => $this->agent['id'], ...$over];
    }

    private function preview(array $over = [])
    {
        return $this->postJson('/api/sharing/links/preview', $this->source($over));
    }

    /** Preview, then confirm exactly that. Returns [response, token]. */
    private function share(array $over = [], array $extra = []): array
    {
        $hash = $this->preview($over)->assertOk()->json('preview.snapshotHash');
        $r = $this->postJson('/api/sharing/links', [...$this->source($over), 'snapshotHash' => $hash, 'confirm' => true, ...$extra]);
        return [$r, $r->status() === 201 ? basename(parse_url($r->json('url'), PHP_URL_PATH)) : ''];
    }

    private function page(string $token)
    {
        return $this->get('/s/'.$token);
    }
}
