<?php

namespace App\Services\ChatConnectors\Figma;

/**
 * Flattens a Figma node subtree into something a model can read. A design
 * document is arbitrarily deep and its raw JSON is enormous, so this keeps
 * only what answers "what does this screen say" - name, type, absolute
 * bounds, text and simplified fill colours - and bounds both depth and total
 * bytes rather than trusting the caller's request to be reasonably sized.
 * Truncation is reported, never hidden: a caller that reads a cut-off tree as
 * complete would describe a screen it never actually saw.
 */
final class Nodes
{
    public function __construct(private readonly Client $client) {}

    /** One node and its children, read fresh from the file. */
    public function read(array $a, string $token): array
    {
        $r = $this->client->get($token, '/files/'.$a['fileKey'].'/nodes', ['ids' => $a['nodeId'], 'depth' => 8]);
        if (isset($r['error'])) return $r;
        $entry = $r['data']['nodes'][$a['nodeId']] ?? null;
        if (!is_array($entry) || !is_array($entry['document'] ?? null)) {
            return ['error' => 'That node was not found in this file, or this connection cannot access it.'];
        }
        return $this->flatten($entry['document'], 6, 12000) + ['file' => $a['fileKey']];
    }

    /** A shallow read of a whole document tree, for listing what a file contains. */
    public function overview(array $document): array
    {
        return $this->flatten($document, 2, 8000);
    }

    private function flatten(array $document, int $maxDepth, int $maxBytes): array
    {
        $bytes = 0;
        $truncated = false;
        $node = $this->node($document, 0, $maxDepth, $maxBytes, $bytes, $truncated);
        return ['node' => $node, 'truncated' => $truncated, 'coverage' => $truncated
            ? 'The tree was cut off by depth or size; ask for a deeper read of one named child if you need more.'
            : 'The full tree within the requested depth is included.'];
    }

    private function node(array $n, int $depth, int $maxDepth, int $maxBytes, int &$bytes, bool &$truncated): array
    {
        $out = ['id' => $n['id'] ?? null, 'name' => Client::clip($n['name'] ?? null, 200), 'type' => $n['type'] ?? null];
        $box = $n['absoluteBoundingBox'] ?? null;
        if (is_array($box)) $out['bounds'] = [
            'x' => $this->round($box['x'] ?? null), 'y' => $this->round($box['y'] ?? null),
            'width' => $this->round($box['width'] ?? null), 'height' => $this->round($box['height'] ?? null),
        ];
        if (is_string($n['characters'] ?? null) && $n['characters'] !== '') $out['text'] = Client::clip($n['characters'], 2000);
        $fills = $this->fills($n['fills'] ?? null);
        if ($fills) $out['fills'] = $fills;
        $bytes += strlen((string) json_encode($out));

        $children = $n['children'] ?? null;
        if (!is_array($children) || $children === []) return $out;
        if ($depth >= $maxDepth) { $truncated = true; return $out; }

        $kept = [];
        foreach (array_slice($children, 0, 40) as $child) {
            if (!is_array($child) || $bytes >= $maxBytes) { $truncated = true; break; }
            $kept[] = $this->node($child, $depth + 1, $maxDepth, $maxBytes, $bytes, $truncated);
        }
        if (count($children) > 40) $truncated = true;
        if ($kept) $out['children'] = $kept;
        return $out;
    }

    /** Up to four visible fills, as a hex colour and an opacity - never the raw paint object. */
    private function fills(mixed $raw): array
    {
        if (!is_array($raw)) return [];
        $visible = array_values(array_filter($raw, fn ($f) => is_array($f) && ($f['visible'] ?? true)));
        return array_map(function (array $fill) {
            $entry = ['type' => (string) ($fill['type'] ?? 'SOLID'), 'opacity' => round((float) ($fill['opacity'] ?? 1.0), 2)];
            $color = $fill['color'] ?? null;
            if (is_array($color)) $entry['color'] = sprintf('#%02x%02x%02x',
                max(0, min(255, (int) round(255 * (float) ($color['r'] ?? 0)))),
                max(0, min(255, (int) round(255 * (float) ($color['g'] ?? 0)))),
                max(0, min(255, (int) round(255 * (float) ($color['b'] ?? 0)))));
            return $entry;
        }, array_slice($visible, 0, 4));
    }

    private function round(mixed $value): ?int
    {
        return is_numeric($value) ? (int) round((float) $value) : null;
    }
}
