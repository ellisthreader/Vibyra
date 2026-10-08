<?php

namespace App\Services\ChatConnectors\Github;

final class Issues
{
    public function __construct(private readonly Client $client) {}

    public function read(array $args, string $token): array
    {
        $path = Client::path($args['repository']).'/issues/'.$args['number'];
        $response = $this->client->get($token, $path);
        if (isset($response['error'])) return $response;
        $issue = $response['data'];
        if (!is_array($issue) || ($issue['number'] ?? null) !== $args['number']) {
            return ['error' => 'GitHub returned an unreadable issue.'];
        }
        if (isset($issue['pull_request'])) {
            return ['error' => 'That number is a pull request. Use github_pull_request.'];
        }
        $body = is_string($issue['body'] ?? null) ? $issue['body'] : '';
        $count = max(0, (int) ($issue['comments'] ?? 0));
        $result = [
            'number' => $args['number'],
            'title' => Client::clip($issue['title'] ?? '', 250),
            'state' => $issue['state'] ?? null,
            'url' => $issue['html_url'] ?? null,
            'author' => $issue['user']['login'] ?? null,
            'updatedAt' => $issue['updated_at'] ?? null,
            'labels' => array_values(array_filter(array_map(fn ($label) => Client::clip($label['name'] ?? null, 80),
                array_slice($issue['labels'] ?? [], 0, 10)))),
            'body' => Client::clip($body, 4000),
            'bodyTruncated' => strlen($body) > 4000,
            'commentCount' => $count,
            'commentPage' => $args['page'],
            'comments' => [],
            'hasMoreComments' => false,
            'nextPage' => null,
            'coverage' => 'Issue body is capped at 4000 bytes; comments are capped at 10 per page and 100 pages.',
        ];
        if ($count === 0) return $result;
        $comments = $this->client->get($token, $path.'/comments', ['per_page' => 10, 'page' => $args['page']]);
        if (isset($comments['error'])) return ['error' => 'Issue comments could not be read. '.$comments['error']] + $comments;
        if (!is_array($comments['data'])) return ['error' => 'GitHub returned unreadable issue comments.'];
        $result['comments'] = array_map(function ($comment) {
            $body = is_string($comment['body'] ?? null) ? $comment['body'] : '';
            return ['author' => $comment['user']['login'] ?? null,
                'body' => Client::clip($body, 1200), 'bodyTruncated' => strlen($body) > 1200,
                'url' => $comment['html_url'] ?? null, 'createdAt' => $comment['created_at'] ?? null];
        }, array_slice($comments['data'], 0, 10));
        $result['hasMoreComments'] = $comments['hasMore'];
        $result['nextPage'] = $comments['hasMore'] && $args['page'] < 100 ? $args['page'] + 1 : null;
        return $result;
    }
}
