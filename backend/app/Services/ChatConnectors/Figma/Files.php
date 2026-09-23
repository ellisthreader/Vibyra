<?php

namespace App\Services\ChatConnectors\Figma;

/**
 * Figma's REST API has no "recent files across my account" endpoint reachable
 * from a plain OAuth token - that needs a team id nothing here collects. So
 * `overview` answers a narrower, more honest question: what pages and frames
 * exist in the one file the person named, the same way a GitHub read starts
 * from an owner/name repository rather than a list of every repo a token can see.
 */
final class Files
{
    public function __construct(private readonly Client $client, private readonly Nodes $nodes) {}

    public function overview(array $a, string $token): array
    {
        $r = $this->client->get($token, '/files/'.$a['fileKey'], ['depth' => 2]);
        if (isset($r['error'])) return $r;
        $body = $r['data'];
        if (!is_array($body['document'] ?? null)) return ['error' => 'This file has no readable document.'];
        return [
            'file' => $a['fileKey'], 'name' => Client::clip($body['name'] ?? null, 200),
            'lastModified' => $body['lastModified'] ?? null, 'version' => $body['version'] ?? null,
            ...$this->nodes->overview($body['document']),
        ];
    }

    public function comments(array $a, string $token): array
    {
        $r = $this->client->get($token, '/files/'.$a['fileKey'].'/comments');
        if (isset($r['error'])) return $r;
        $entries = $r['data']['comments'] ?? null;
        if (!is_array($entries)) return ['error' => 'Figma returned no readable comments.'];
        $comments = array_map(fn ($c) => [
            'id' => (string) ($c['id'] ?? ''), 'parentId' => $c['parent_id'] ?? null,
            'message' => Client::clip($c['message'] ?? null, 1000),
            'author' => $c['user']['handle'] ?? null, 'createdAt' => $c['created_at'] ?? null,
            'resolved' => (bool) ($c['resolved_at'] ?? false),
            'nodeId' => is_array($c['client_meta']['node_id'] ?? null)
                ? ($c['client_meta']['node_id'][0] ?? null) : ($c['client_meta']['node_id'] ?? null),
        ], array_slice($entries, 0, 30));
        return ['file' => $a['fileKey'], 'comments' => $comments, 'truncated' => count($entries) > 30];
    }
}
