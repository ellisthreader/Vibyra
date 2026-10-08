<?php

namespace App\Services\AgentRuns\Tools\Providers;

use App\Services\ChatConnectors\Github\Client;

/**
 * Approval-gated GitHub writes: open an issue, comment on an issue. What was
 * approved is exactly what is posted; the receipt names the issue/comment and its
 * URL. GitHub has no idempotency key, so an unconfirmed POST is `outcome_unknown`.
 */
final class GithubWrites
{
    private const BASE = 'https://api.github.com';

    public static function repository(mixed $repository): string
    {
        abort_unless(is_string($repository) && preg_match('#\A[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}\z#D', $repository)
            && count(array_intersect(explode('/', $repository), ['.', '..'])) === 0, 422, 'Use an exact owner/name repository.');
        return $repository;
    }

    public function definition(string $tool): array
    {
        $repo = ['repository' => ['type' => 'string', 'description' => 'Exact owner/name.']];
        return match ($tool) {
            'github_create_issue' => Schema::tool($tool, 'Open one issue after the person approves the exact repository, '
                .'title and body. Only report it opened when the result has a number and url.',
                $repo + ['title' => ['type' => 'string'], 'body' => ['type' => 'string']], ['repository', 'title']),
            'github_comment_issue' => Schema::tool($tool, 'Post one comment on an issue or pull request after the person '
                .'approves the exact repository, number and body.',
                $repo + ['number' => ['type' => 'integer', 'minimum' => 1], 'body' => ['type' => 'string']],
                ['repository', 'number', 'body']),
            default => [],
        };
    }

    public function validate(string $tool, array $arguments): array
    {
        if ($tool === 'github_create_issue') {
            Schema::only($arguments, ['repository', 'title', 'body']);
            return ['repository' => self::repository($arguments['repository'] ?? null),
                'title' => Schema::line($arguments['title'] ?? null, 250, 'Give the issue a single-line title up to 250 characters.'),
                'body' => (string) Schema::text($arguments['body'] ?? null, 8000, 'That issue body is too long.', false)];
        }
        abort_unless($tool === 'github_comment_issue', 422, 'That GitHub tool is unavailable.');
        Schema::only($arguments, ['repository', 'number', 'body']);
        $number = $arguments['number'] ?? null;
        abort_unless(is_int($number) && $number > 0, 422, 'Choose an issue number.');
        return ['repository' => self::repository($arguments['repository'] ?? null), 'number' => $number,
            'body' => Schema::text($arguments['body'] ?? null, 8000, 'Give a non-empty comment up to 8000 characters.')];
    }

    public function run(string $tool, array $a, string $token): array
    {
        $issues = self::BASE.Client::path($a['repository']).'/issues';
        if ($tool === 'github_create_issue') {
            $response = ProviderHttp::send('GitHub', 'github', true, fn () => ProviderHttp::github($token)
                ->post($issues, ['title' => $a['title']] + ($a['body'] !== '' ? ['body' => $a['body']] : [])));
            $issue = ProviderHttp::json($response, 'GitHub', true);
            $number = $issue['number'] ?? null;
            if ($response->status() !== 201 || !is_int($number) || $number < 1
                || !$this->url($issue, $a, ['/issues/'.$number]))
                throw ToolFailure::unknown('GitHub');
            return ['result' => ['number' => $number, 'title' => $issue['title'] ?? $a['title'], 'url' => $issue['html_url'],
                'repository' => $a['repository']], 'summary' => 'Opened issue #'.$number.' on '.$a['repository'],
                'resourceId' => $a['repository'].'#'.$number, 'url' => $issue['html_url']];
        }
        $response = ProviderHttp::send('GitHub', 'github', true, fn () => ProviderHttp::github($token)
            ->post($issues.'/'.$a['number'].'/comments', ['body' => $a['body']]));
        $comment = ProviderHttp::json($response, 'GitHub', true);
        $id = $comment['id'] ?? null;
        if ($response->status() !== 201 || !is_int($id) || $id < 1 || !$this->url($comment, $a,
            ['/issues/'.$a['number'].'#issuecomment-'.$id, '/pull/'.$a['number'].'#issuecomment-'.$id]))
            throw ToolFailure::unknown('GitHub');
        return ['result' => ['commentId' => $id, 'number' => $a['number'], 'url' => $comment['html_url'],
            'repository' => $a['repository']], 'summary' => 'Commented on #'.$a['number'].' in '.$a['repository'],
            'resourceId' => (string) $id, 'url' => $comment['html_url']];
    }

    /** Confirm the exact resource, including the approved issue/PR number for comments. */
    private function url(array $body, array $a, array $suffixes): bool
    {
        $url = $body['html_url'] ?? null;
        if (!is_string($url)) return false;
        foreach ($suffixes as $suffix) {
            if (strcasecmp($url, 'https://github.com/'.$a['repository'].$suffix) === 0) return true;
        }
        return false;
    }
}
