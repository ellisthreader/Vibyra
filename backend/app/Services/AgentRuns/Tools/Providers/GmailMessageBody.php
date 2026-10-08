<?php

namespace App\Services\AgentRuns\Tools\Providers;

/** Bounded text extraction; MIME bodies are untrusted content, never executable HTML. */
final class GmailMessageBody
{
    private const MAX_BYTES = 1000000;
    private int $remaining = self::MAX_BYTES;
    private int $nodes = 0;
    private int $fetches = 0;
    private array $omitted = [];

    public function extract(array $payload, callable $fetch): array
    {
        $this->remaining = self::MAX_BYTES;
        $this->nodes = $this->fetches = 0;
        $this->omitted = [];
        $text = $this->part($payload, $fetch, 0);
        return ['text' => $text, 'bodyComplete' => $this->omitted === [],
            'bodyOmissions' => array_values(array_unique($this->omitted))];
    }

    private function part(array $part, callable $fetch, int $depth): string
    {
        if (++$this->nodes > 100 || $depth > 12) return $this->omit('MIME structure limit reached.');
        if (($part['filename'] ?? '') !== '' || preg_match('/^attachment\b/i', $this->header($part, 'Content-Disposition')))
            return $this->omit('File attachments are not included in the message body.');
        $mime = strtolower((string) ($part['mimeType'] ?? ''));
        if (str_starts_with($mime, 'multipart/')) {
            $parts = is_array($part['parts'] ?? null) ? $part['parts'] : [];
            if ($mime === 'multipart/alternative') {
                // Select the plain representation regardless of provider part order; never duplicate alternatives.
                foreach (['text/plain', 'text/html'] as $preferred) {
                    foreach ($parts as $child) {
                        if (is_array($child) && strtolower((string) ($child['mimeType'] ?? '')) === $preferred)
                            return $this->part($child, $fetch, $depth + 1);
                    }
                }
            }
            $texts = [];
            foreach (array_slice($parts, 0, 100) as $child) {
                if (is_array($child)) $texts[] = $this->part($child, $fetch, $depth + 1);
                else $this->omit('A malformed MIME part was omitted.');
            }
            if (count($parts) > 100) $this->omit('MIME structure limit reached.');
            return implode("\n\n", array_filter($texts, fn ($text) => $text !== ''));
        }
        if (!in_array($mime, ['text/plain', 'text/html'], true)) return $this->omit('Non-text content was omitted.');
        $body = is_array($part['body'] ?? null) ? $part['body'] : [];
        if (isset($body['attachmentId']) && !isset($body['data'])) {
            if (!is_string($body['attachmentId']) || ++$this->fetches > 4 || ($body['size'] ?? 0) > $this->remaining)
                return $this->omit('External text body exceeded the retrieval limit.');
            $body = $fetch($body['attachmentId']);
        }
        $encoded = $body['data'] ?? null;
        if (!is_string($encoded)) return $this->omit('Text body was unavailable.');
        if (strlen($encoded) > (int) ceil($this->remaining / 3) * 4)
            return $this->omit('Text body exceeded the size limit.');
        $text = base64_decode(strtr($encoded, '-_', '+/'), true);
        if ($text === false || strlen($text) > $this->remaining) return $this->omit('Text body could not be decoded within the size limit.');
        $this->remaining -= strlen($text);
        if (preg_match('/charset\s*=\s*["\']?([A-Za-z0-9._-]+)/i', $this->header($part, 'Content-Type'), $match)) {
            try { $text = mb_convert_encoding($text, 'UTF-8', $match[1]); }
            catch (\ValueError) { return $this->omit('Text body used an unsupported character encoding.'); }
        }
        if (!mb_check_encoding($text, 'UTF-8')) return $this->omit('Text body was not valid UTF-8.');
        return $mime === 'text/html' ? $this->htmlText($text) : $text;
    }

    private function htmlText(string $html): string
    {
        if ($html === '') return '';
        $doc = new \DOMDocument;
        $old = libxml_use_internal_errors(true);
        try {
            $doc->loadHTML('<?xml encoding="UTF-8">'.$html, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
            $xpath = new \DOMXPath($doc);
            foreach ($xpath->query('//script|//style|//head|//noscript|//template') as $node) $node->parentNode?->removeChild($node);
            foreach ($xpath->query('//br|//p|//div|//li|//tr|//h1|//h2|//h3') as $node)
                $node->appendChild($doc->createTextNode("\n"));
            return trim(preg_replace('/[\t ]+/', ' ', $doc->textContent));
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($old);
        }
    }

    private function header(array $part, string $name): string
    {
        foreach ($part['headers'] ?? [] as $header)
            if (is_array($header) && strcasecmp((string) ($header['name'] ?? ''), $name) === 0)
                return (string) ($header['value'] ?? '');
        return '';
    }

    private function omit(string $reason): string
    {
        $this->omitted[] = $reason;
        return '';
    }
}
