<?php

namespace App\Http\Controllers\Concerns;

trait ChatReplyGuard
{
    private function guardedChatReply(string $prompt, string $reply, string $projectFiles, bool $buildMode): string
    {
        if ($buildMode || trim($projectFiles) === '' || ! $this->isStyleAnalysisPrompt($prompt)) {
            return $reply;
        }

        if (! $this->looksLikeShellCommandAnswer($reply)) {
            return $reply;
        }

        return $this->styleSummaryFromProjectFiles($projectFiles);
    }

    private function isStyleAnalysisPrompt(string $prompt): bool
    {
        return (bool) preg_match('/\b(colou?r|palette|scheme|theme|brand|branding|visual identity|styling|design system)\b/i', $prompt);
    }

    private function looksLikeShellCommandAnswer(string $reply): bool
    {
        if (preg_match('/```(?:bash|sh|shell|zsh|terminal)?\s*[\r\n]+/i', $reply)) {
            return true;
        }

        $commandLines = 0;
        foreach (preg_split('/\r\n|\r|\n/', $reply) ?: [] as $line) {
            if (preg_match('/^\s*(?:\$|>)?\s*(rg|grep|find|awk|sed|cat|ls|npm|yarn|pnpm|bash|sh|node|python|php)\b/i', $line)) {
                $commandLines++;
            }
        }

        return $commandLines > 0;
    }

    private function styleSummaryFromProjectFiles(string $projectFiles): string
    {
        preg_match_all('/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)/', $projectFiles, $matches);
        $colors = array_values(array_unique(array_slice($matches[0] ?? [], 0, 10)));

        if ($colors === []) {
            return 'The provided style snippets show this project has theme/style files, but they do not include enough colour values for me to name the palette confidently.';
        }

        $lower = strtolower($projectFiles);
        $theme = str_contains($lower, '#0b0d17') || str_contains($lower, '#080') || str_contains($lower, 'dark')
            ? 'a dark theme'
            : 'a styled theme';
        $primary = $colors[0];
        $rest = array_slice($colors, 1);

        return 'The colour scheme appears to be '.$theme.'. The clearest primary/accent value is '.$primary
            .($rest ? ', with supporting values '.implode(', ', $rest).'.' : '.');
    }
}
