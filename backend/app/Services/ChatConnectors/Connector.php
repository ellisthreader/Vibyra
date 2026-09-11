<?php

namespace App\Services\ChatConnectors;

/**
 * One connected service. A connector owns three things and nothing else: the tool
 * schemas it offers the model, what a valid call to one of them looks like, and
 * how to run it against the person's own account.
 *
 * Operation names are prefixed with the integration's slug (`github_list_repositories`)
 * so `Registry` can route a tool call back to its owner without a lookup table
 * that could drift from the schemas themselves.
 */
interface Connector
{
    /** OpenAI-style function schemas, in the shape OpenRouter accepts. */
    public function definitions(): array;

    /**
     * The operations that change something in the person's account, as opposed to
     * only reading it. Declaring this rather than leaving it to the catalogue's
     * prose is what keeps the two honest: a connector that grows a write and says
     * nothing about it fails its own test rather than shipping a page that
     * promises the integration only looks.
     *
     * @return string[] operation names, a subset of what `definitions` offers
     */
    public function writes(): array;

    /**
     * The safe subset of `$arguments` for `$operation`. Arguments are never stored
     * or forwarded verbatim; anything not named here is dropped. Aborts 422 when
     * the call cannot be honoured.
     */
    public function validate(string $operation, array $arguments): array;

    /**
     * Run one operation against the account `$credential` reaches.
     * Returns `['result' => array, 'summary' => string]`; the result goes back to
     * the model and the summary is the single line the transcript shows.
     */
    public function run(string $operation, array $arguments, string $credential): array;

    /**
     * Check that `$credential` really reaches an account and return the label to
     * show for it. Throwing here is how a bad key is refused at connect time
     * rather than in the middle of someone's reply.
     */
    public function connect(string $credential): string;
}
