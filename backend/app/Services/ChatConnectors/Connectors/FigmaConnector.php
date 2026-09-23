<?php

namespace App\Services\ChatConnectors\Connectors;

use App\Services\ChatConnectors\Connector;
use App\Services\ChatConnectors\Figma\{ReadTools, Files, Nodes, Prompt};
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Read-only on purpose: the design itself, and the comments left on it. Figma's
 * own additive write - posting a comment - is left for a later pass, so there is
 * nothing here to reconcile against the catalogue's "Changes" section.
 */
class FigmaConnector implements Connector
{
    public function definitions(): array
    {
        return ReadTools::definitions();
    }

    public function writes(): array
    {
        return [];
    }

    public function reads(): array
    {
        return ReadTools::NAMES;
    }

    public function validate(string $operation, array $arguments): array
    {
        abort_unless(in_array($operation, ReadTools::NAMES, true), 422, 'That Figma tool is not available.');
        return ReadTools::validate($operation, $arguments);
    }

    public function run(string $operation, array $arguments, string $credential): array
    {
        $result = match ($operation) {
            'figma_list_frames' => app(Files::class)->overview($arguments, $credential),
            'figma_read_frame' => app(Nodes::class)->read($arguments, $credential),
            'figma_file_comments' => app(Files::class)->comments($arguments, $credential),
            default => ['error' => 'That Figma tool is not available.'],
        };
        $label = match ($operation) {
            'figma_list_frames' => 'pages and frames in',
            'figma_read_frame' => 'a frame in',
            'figma_file_comments' => 'comments on',
        };
        return ['result' => $result, 'summary' => (isset($result['error']) ? 'Could not read ' : 'Read ').$label.' Figma file '.$arguments['fileKey']];
    }

    public function connect(string $credential): string
    {
        $response = Http::withToken($credential)->acceptJson()->timeout((int) config('chat_connectors.timeout_seconds', 12))
            ->get('https://api.figma.com/v1/me');
        $body = $response->successful() ? $response->json() : null;
        if (!is_array($body) || !is_string($body['handle'] ?? null)) {
            throw new RuntimeException('That did not work. Check the connection and try again.');
        }
        $email = $body['email'] ?? null;
        return is_string($email) && trim($email) !== '' ? $email : '@'.$body['handle'];
    }

    public function prompt(): string
    {
        return Prompt::text();
    }
}
