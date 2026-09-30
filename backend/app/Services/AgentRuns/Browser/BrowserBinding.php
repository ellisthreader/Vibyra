<?php

namespace App\Services\AgentRuns\Browser;

use App\Models\AgentV2\{Connection, Run, ToolAction};
use App\Services\AgentRuns\Tools\ToolRefused;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Turns a model's browser call into exact arguments. `browser_open` must target a
 * granted origin. `browser_submit` binds the exact form the Mac reported in this
 * task's snapshot with that pageFingerprint: page URL, destination, method, fields
 * and button label all go into the approval fingerprint, and the Mac refuses the
 * submit if the live page no longer matches (fresh snapshot + approval needed).
 */
final class BrowserBinding
{
    private const MAX_FIELDS = 30;
    private const SNAPSHOT_TOOLS = ['browser_open', 'browser_snapshot', 'browser_click', 'browser_type', 'browser_takeover_request'];

    public function bind(Run $run, Connection $browser, string $tool, array $arguments): array
    {
        try { $args = app(BrowserTools::class)->validate($tool, $arguments); }
        catch (HttpException $e) { throw new ToolRefused('invalid_arguments', $e->getMessage()); }
        if ($tool === 'browser_open' && !BrowserGrants::allows($browser, $args['url']))
            throw self::notAllowed($args['url']);
        return $tool === 'browser_submit' ? $this->submit($run, $browser, $args) : $args;
    }

    private function submit(Run $run, Connection $browser, array $args): array
    {
        $snapshot = ToolAction::query()->where('run_id', $run->id)->where('connection_id', $browser->id)
            ->whereIn('tool', self::SNAPSHOT_TOOLS)->where('state', 'completed')->orderByDesc('created_at')->get()
            ->first(fn (ToolAction $a) => ($a->result['pageFingerprint'] ?? null) === $args['pageFingerprint'])?->result;
        if (!is_array($snapshot))
            throw new ToolRefused('stale_page', 'That pageFingerprint is not from a snapshot in this task. Take a new snapshot first.');
        $form = collect($snapshot['forms'] ?? [])->first(fn ($f) => is_array($f)
            && collect($f['submits'] ?? [])->contains(fn ($s) => ($s['ref'] ?? null) === $args['ref']));
        if (!is_array($form))
            throw new ToolRefused('invalid_arguments', 'That ref is not a submit button of a form in that snapshot.');
        $destination = (string) ($form['action'] ?? '');
        if (!BrowserGrants::allows($browser, $destination)) throw self::notAllowed($destination);
        if (!BrowserGrants::allows($browser, $snapshot['url'] ?? null)) throw self::notAllowed((string) ($snapshot['url'] ?? ''));
        // The card lists the form's fields in full; one past the cap is refused rather than shown truncated (F-06).
        if (count(is_array($form['fields'] ?? null) ? $form['fields'] : []) > self::MAX_FIELDS)
            throw new ToolRefused('invalid_arguments', 'This form has more than '.self::MAX_FIELDS.' fields, more than an approval can show in full.');
        $label = collect($form['submits'])->firstWhere('ref', $args['ref'])['label'] ?? '';
        return ['ref' => $args['ref'], 'pageFingerprint' => $args['pageFingerprint'], 'pageUrl' => (string) $snapshot['url'],
            'destination' => $destination, 'method' => strtoupper((string) ($form['method'] ?? 'GET')),
            'submitLabel' => mb_substr((string) $label, 0, 200), 'fields' => self::fields($form['fields'] ?? [])];
    }

    /** The exact field summary a person reviews: names, labels and values, secrets hidden. */
    public static function fields(mixed $fields): array
    {
        return collect(is_array($fields) ? $fields : [])->take(self::MAX_FIELDS)->filter(fn ($f) => is_array($f))
            ->map(fn ($f) => ['name' => mb_substr((string) ($f['name'] ?? ''), 0, 100), 'label' => mb_substr((string) ($f['label'] ?? ''), 0, 200),
                'type' => mb_substr((string) ($f['type'] ?? 'text'), 0, 20),
                'value' => self::secret($f) ? '[hidden]' : mb_substr((string) ($f['value'] ?? ''), 0, 2000)])->values()->all();
    }

    public static function secret(array $field): bool
    {
        return in_array(strtolower((string) ($field['type'] ?? '')), ['password', 'hidden'], true) || ($field['secret'] ?? false) === true;
    }

    private static function notAllowed(string $url): ToolRefused
    {
        $origin = BrowserOrigins::ofUrl($url) ?? 'that address';
        return new ToolRefused('origin_not_allowed', 'This teammate may not use '.$origin
            .'. Ask the person to add it to the teammate\'s allowed sites.');
    }
}
