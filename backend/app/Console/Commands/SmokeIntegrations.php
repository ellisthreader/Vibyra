<?php

namespace App\Console\Commands;

use App\Services\Integrations\Registry;
use Illuminate\Console\Command;
use Throwable;

/**
 * Proves the connectors against the real services, which is the only thing that
 * ever really proves them. Recorded answers show the code holds together; they
 * cannot show that a scope is too narrow, that a token shape changed, or that a
 * provider renamed a field last month.
 *
 * Credentials are read from the environment and never written anywhere. Reads run
 * by default; writes are opt-in with `--write`, because a smoke run that quietly
 * files an issue on someone's repository every time it is invoked is a smoke run
 * nobody will dare to leave in CI.
 *
 *   php artisan integrations:smoke                    reads only, every credential present
 *   php artisan integrations:smoke --write            reads and one real write each
 *   php artisan integrations:smoke github,stripe      just those two
 */
class SmokeIntegrations extends Command
{
    protected $signature = 'integrations:smoke {only? : Comma-separated slugs, default every one with a credential}
        {--write : Also perform one real write per integration, which creates real objects}';

    protected $description = 'Run one real read, and optionally one real write, against every connected integration';

    /**
     * Where each integration's credential is read from, the read to prove it, and
     * the write to prove it can change something. A write is written to be as easy
     * to find and undo as possible: everything it creates says Vibyra smoke test.
     */
    private const CHECKS = [
        'github' => ['SMOKE_GITHUB_TOKEN', 'github_list_repositories', [],
            'github_create_issue', ['repository' => 'SMOKE_GITHUB_REPOSITORY', 'title' => 'Vibyra smoke test',
                'body' => 'Opened by `php artisan integrations:smoke --write`. Safe to close.']],
        'stripe' => ['SMOKE_STRIPE_KEY', 'stripe_balance', [],
            'stripe_create_customer', ['email' => 'SMOKE_STRIPE_EMAIL', 'description' => 'Vibyra smoke test']],
    ];

    public function handle(Registry $registry): int
    {
        $only = array_filter(array_map('trim', explode(',', (string) $this->argument('only'))));
        $rows = [];
        $failed = false;
        $skipped = [];

        foreach (self::CHECKS as $slug => [$variable, $read, $readArguments, $write, $writeArguments]) {
            if ($only && !in_array($slug, $only, true)) continue;
            $credential = (string) env($variable, '');
            if ($credential === '') { $skipped[] = $slug.' ('.$variable.')'; continue; }

            $connector = $registry->for($slug);
            $account = $this->attempt(fn () => $connector->connect($credential));
            $rows[] = [$slug, 'connect', $this->mark($account), $this->say($account)];
            $failed = $failed || !$account['ok'];
            // A credential that does not reach an account cannot prove anything else,
            // and two more failures underneath it would only obscure the one that matters.
            if (!$account['ok']) continue;

            $rows[] = [$slug, $read, ...$this->operation($connector, $read, $readArguments, $credential, $failed)];

            if (!$this->option('write')) continue;
            $resolved = $this->resolve($writeArguments);
            if ($resolved === null) {
                $rows[] = [$slug, $write, '—', 'Needs '.implode(', ', $this->missing($writeArguments))];
                continue;
            }
            $rows[] = [$slug, $write, ...$this->operation($connector, $write, $resolved, $credential, $failed)];
        }

        $this->table(['Integration', 'Operation', 'Result', 'What happened'], $rows);
        foreach ($skipped as $slug) $this->line('  skipped '.$slug.': no credential in the environment');
        if (!$this->option('write')) $this->comment('Reads only. Add --write to prove the write half; it creates real objects.');

        return $failed ? self::FAILURE : self::SUCCESS;
    }

    /** One operation, validated exactly as a real tool call would be, then run. */
    private function operation($connector, string $operation, array $arguments, string $credential, bool &$failed): array
    {
        $outcome = $this->attempt(function () use ($connector, $operation, $arguments, $credential) {
            $result = $connector->run($operation, $connector->validate($operation, $arguments), $credential);
            // A connector reports a refusal in its result rather than by throwing, so
            // a green row here would otherwise mean nothing more than "it returned".
            if (isset($result['result']['error'])) throw new \RuntimeException((string) $result['result']['error']);
            return (string) $result['summary'];
        });
        $failed = $failed || !$outcome['ok'];
        return [$this->mark($outcome), $this->say($outcome)];
    }

    /** @return array{ok: bool, message: string} */
    private function attempt(callable $run): array
    {
        try { return ['ok' => true, 'message' => (string) $run()]; }
        catch (Throwable $e) { return ['ok' => false, 'message' => $e->getMessage()]; }
    }

    /** Placeholders naming an environment variable, filled in from it. */
    private function resolve(array $arguments): ?array
    {
        if ($this->missing($arguments)) return null;
        foreach ($arguments as $key => $value) {
            if (is_string($value) && str_starts_with($value, 'SMOKE_')) $arguments[$key] = (string) env($value);
        }
        return $arguments;
    }

    /** @return string[] the SMOKE_ variables this write needs and does not have */
    private function missing(array $arguments): array
    {
        return array_values(array_filter(array_map(
            fn ($value) => is_string($value) && str_starts_with($value, 'SMOKE_') && (string) env($value, '') === '' ? $value : null,
            $arguments)));
    }

    private function mark(array $outcome): string
    {
        return $outcome['ok'] ? '<info>pass</info>' : '<error>FAIL</error>';
    }

    private function say(array $outcome): string
    {
        return mb_substr(trim(preg_replace('/\s+/', ' ', $outcome['message'])), 0, 90);
    }
}
