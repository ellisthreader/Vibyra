<?php

namespace App\Services\Moderation;

trait LocalTextRules
{
    protected function localTextDecision(string $text, string $surface): array
    {
        $maxCharacters = (int) config('moderation.max_text_characters', 12000);

        if (mb_strlen($text) > $maxCharacters) {
            return $this->blockedDecision($surface, 'spam', 'too_long');
        }

        foreach ((array) config('moderation.blocked_patterns', []) as $rule) {
            $pattern = (string) ($rule['pattern'] ?? '');

            if ($pattern !== '' && @preg_match($pattern, $text) === 1) {
                return $this->blockedDecision($surface, (string) ($rule['category'] ?? 'blocked_pattern'), 'pattern');
            }
        }

        $variants = $this->textVariants($text);

        foreach ((array) config('moderation.blocked_terms', []) as $category => $terms) {
            foreach ((array) $terms as $term) {
                if ($this->containsBlockedTerm($variants, (string) $term)) {
                    return $this->blockedDecision($surface, (string) $category, 'blocked_term');
                }
            }
        }

        $spamReason = $this->spamReason($text, $surface);

        if ($spamReason !== null) {
            return $this->blockedDecision($surface, 'spam', $spamReason);
        }

        return $this->allowedDecision($surface);
    }

    protected function containsBlockedTerm(array $variants, string $term): bool
    {
        $termVariants = $this->textVariants($term);
        $needleWords = preg_quote($termVariants['words_squeezed'], '/');

        if ($needleWords !== '' && preg_match('/(?:^|\s)'.$needleWords.'(?:\s|$)/u', $variants['words_squeezed']) === 1) {
            return true;
        }

        $needleCompact = $termVariants['compact_squeezed'];
        if (strlen($needleCompact) < 3) {
            return false;
        }

        $chars = array_map(fn (string $char) => preg_quote($char, '/'), str_split($needleCompact));
        $pattern = '/(?:^|[^a-z0-9])'.implode('[^a-z0-9]*', $chars).'(?:[^a-z0-9]|$)/u';

        return preg_match($pattern, $variants['normalized_squeezed']) === 1;
    }

    protected function textVariants(string $text): array
    {
        $normalized = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $normalized = strtr($normalized, [
            '0' => 'o', '1' => 'i', '2' => 'z', '3' => 'e', '4' => 'a', '5' => 's',
            '6' => 'g', '7' => 't', '8' => 'b', '9' => 'g', '@' => 'a', '$' => 's',
            '!' => 'i', '|' => 'i', '+' => 't', '(' => 'c', '<' => 'c', '[' => 'c',
            ')' => 'o', '*' => '', '_' => '', '-' => '', '.' => '', ',' => '',
            '/' => '', '\\' => '', '\'' => '', '"' => '',
            'а' => 'a', 'е' => 'e', 'о' => 'o', 'р' => 'p', 'с' => 'c', 'х' => 'x',
            'у' => 'y', 'і' => 'i', 'А' => 'a', 'Е' => 'e', 'О' => 'o', 'Р' => 'p',
            'С' => 'c', 'Х' => 'x', 'У' => 'y', 'І' => 'i',
        ]);
        $ascii = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $normalized);
        $normalized = strtolower($ascii !== false ? $ascii : $normalized);
        $words = trim((string) preg_replace('/[^a-z0-9]+/u', ' ', $normalized));
        $compact = (string) preg_replace('/[^a-z0-9]+/u', '', $normalized);

        return [
            'words' => $words,
            'words_squeezed' => $this->squeezeRepeatedLetters($words),
            'compact' => $compact,
            'compact_squeezed' => $this->squeezeRepeatedLetters($compact),
            'normalized_squeezed' => $this->squeezeRepeatedLetters($normalized),
        ];
    }

    protected function squeezeRepeatedLetters(string $text): string
    {
        return (string) preg_replace('/([a-z0-9])\1{1,}/', '$1', $text);
    }

    protected function spamReason(string $text, string $surface): ?string
    {
        $urlCount = preg_match_all('/(?:https?:\/\/|www\.|bit\.ly|t\.me\/|wa\.me\/|discord\.gg\/)/iu', $text);
        $commentSurface = preg_match('/comment|review|feedback|post/i', $surface) === 1;

        if ($urlCount >= 2 || ($commentSurface && $urlCount >= 1)) {
            return 'too_many_links';
        }

        if (preg_match('/(.)\1{9,}/u', $text) === 1) {
            return 'repeated_characters';
        }

        if (preg_match('/\b([a-z0-9]{2,})\b(?:\W+\1\b){4,}/iu', $text) === 1) {
            return 'repeated_words';
        }

        $emojiCount = preg_match_all('/[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}]/u', $text);

        if ($emojiCount >= 8) {
            return 'emoji_flood';
        }

        $letters = preg_match_all('/[A-Z]/', $text);
        $allLetters = preg_match_all('/[A-Za-z]/', $text);

        if ($allLetters >= 18 && $letters / max(1, $allLetters) > 0.8) {
            return 'shouting';
        }

        return null;
    }
}
