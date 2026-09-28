<?php

namespace App\Services\ChatConnectors\Github;

final class Files
{
    public function __construct(private readonly Client $client) {}

    public function read(array $a, string $token): array
    {
        $path = implode('/', array_map('rawurlencode', explode('/', $a['path'])));
        $r = $this->client->get($token, Client::path($a['repository']).'/contents/'.$path, ['ref' => $a['ref']]);
        if (isset($r['error'])) return $r;
        $d = $r['data'];
        if (array_is_list($d)) return ['entries' => array_map(fn ($x) => array_intersect_key($x, array_flip(['name', 'path', 'type', 'html_url'])),
            array_slice($d, 0, 100)), 'truncated' => count($d) > 100, 'coverage' => 'At most 100 directory entries; GitHub caps contents listings at 1000.'];
        if (($d['type'] ?? '') !== 'file' || ($d['encoding'] ?? '') !== 'base64' || ($d['size'] ?? 0) > 200000)
            return ['error' => 'This resource is not a supported text file (maximum 200 KB).'];
        $text = base64_decode($d['content'] ?? '', true);
        if ($text === false || str_contains($text, "\0") || !mb_check_encoding($text, 'UTF-8')) return ['error' => 'This file is not UTF-8 text.'];
        $lines = explode("\n", $text); $start = $a['startLine']; $selected = []; $bytes = 0; $truncatedLine = false;
        foreach (array_slice($lines, $start - 1, 100) as $i => $line) {
            if ($bytes + strlen($line) > 12000) { $truncatedLine = !$selected; if ($truncatedLine) $selected[] = $start.': '.Client::clip($line, 12000); break; }
            $selected[] = ($start + $i).': '.$line; $bytes += strlen($line);
        }
        $next = $start + count($selected);
        return ['path' => $a['path'], 'ref' => $a['ref'], 'sha' => $d['sha'] ?? null, 'url' => $d['html_url'] ?? null,
            'text' => implode("\n", $selected), 'startLine' => $start, 'totalLines' => count($lines),
            'lineTruncated' => $truncatedLine, 'nextLine' => $next <= count($lines) ? $next : null];
    }
}
