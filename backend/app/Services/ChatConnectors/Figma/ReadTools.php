<?php

namespace App\Services\ChatConnectors\Figma;

final class ReadTools
{
    public const NAMES = ['figma_list_frames', 'figma_read_frame', 'figma_file_comments'];

    public static function definitions(): array
    {
        $file = ['file' => ['type' => 'string', 'description' => 'A Figma file URL (figma.com/file/... or /design/...) or its bare file key.']];
        $items = [
            ['figma_list_frames', 'List the pages and top-level frames in one named Figma file, with names, ids and bounds. Start here to find which frame to read in full.',
                $file, ['file']],
            ['figma_read_frame', 'Read one frame or node in full: its name, bounds, text and simplified fill colours, down through its children. '
                .'Pass a node id, or a file URL whose link already names one (Figma\'s "Copy link to selection").',
                $file + ['node' => ['type' => 'string', 'description' => 'A node id such as "12:34". Omit it when the file URL already names one.']], ['file']],
            ['figma_file_comments', 'Read the comment threads left on one named Figma file.', $file, ['file']],
        ];
        return array_map(fn ($t) => ['type' => 'function', 'function' => ['name' => $t[0], 'description' => $t[1],
            'parameters' => ['type' => 'object', 'properties' => $t[2], 'required' => $t[3], 'additionalProperties' => false]]], $items);
    }

    /**
     * Figma's API has no "recent files" endpoint, so every call names its file
     * explicitly - a pasted link (the natural way someone shares a design) or a
     * bare key. `figma_read_frame` also accepts a node named only inside that link,
     * since "copy link to selection" is how people actually hand over a frame.
     */
    public static function validate(string $operation, array $args): array
    {
        $file = $args['file'] ?? null;
        abort_unless(is_string($file) && trim($file) !== '' && strlen($file) <= 500, 422, 'Give me a Figma file link or file key.');
        $fileKey = self::fileKey($file);
        abort_unless($fileKey !== null, 422, 'That does not look like a Figma file link or file key.');
        $safe = ['fileKey' => $fileKey];
        if ($operation === 'figma_read_frame') {
            $node = $args['node'] ?? null;
            abort_unless($node === null || (is_string($node) && strlen($node) <= 200), 422, 'That node id is too long.');
            $nodeId = self::nodeId($node) ?? self::nodeId($file);
            abort_unless($nodeId !== null, 422, 'Which frame or node? Pass a node id, or a file link that already names one.');
            $safe['nodeId'] = $nodeId;
        }
        return $safe;
    }

    private static function fileKey(string $file): ?string
    {
        $file = trim($file);
        if (preg_match('#^[A-Za-z0-9]{10,80}$#D', $file)) return $file;
        $parts = parse_url($file);
        if (!$parts || ($parts['scheme'] ?? '') !== 'https'
            || !in_array(strtolower($parts['host'] ?? ''), ['figma.com', 'www.figma.com'], true)
            || isset($parts['user']) || isset($parts['pass'])) return null;
        return preg_match('#^/(?:file|design|proto)/([A-Za-z0-9]{10,80})(?:/|$)#D', $parts['path'] ?? '', $m) ? $m[1] : null;
    }

    /** Figma writes a node id in a link as "1-2"; the API wants it back as "1:2". */
    private static function nodeId(?string $value): ?string
    {
        if ($value === null || trim($value) === '') return null;
        $raw = $value;
        if (preg_match('#[?&]node-id=([^&]+)#', $value, $m)) $raw = urldecode($m[1]);
        if (preg_match('#^(\d+)[:\-](\d+)$#D', trim($raw), $m)) return $m[1].':'.$m[2];
        return null;
    }
}
