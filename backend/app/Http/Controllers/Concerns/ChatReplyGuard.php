<?php

namespace App\Http\Controllers\Concerns;

trait ChatReplyGuard
{
    private function guardedChatReply(string $prompt, string $reply, string $projectFiles, bool $buildMode, bool $hasPreviewApp = false): string
    {
        $guarded = $reply;

        if (! $buildMode && trim($projectFiles) !== '' && $this->isStyleAnalysisPrompt($prompt) && $this->looksLikeShellCommandAnswer($reply)) {
            $guarded = $this->styleSummaryFromProjectFiles($projectFiles);
        }

        return $this->mobilePreviewGuidance($prompt, $guarded, $buildMode, $hasPreviewApp);
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

    private function mobilePreviewGuidance(string $prompt, string $reply, bool $buildMode, bool $hasPreviewApp): string
    {
        if (trim($reply) === '' || $this->isLocalDevelopmentPrompt($prompt) || ! $this->mentionsLocalhostPreview($reply)) {
            return $reply;
        }

        if ($hasPreviewApp) {
            return 'Ready to preview on your phone. Tap the Live Preview card below to open it in Vibyra.';
        }

        if ($buildMode || $this->isPreviewPrompt($prompt)) {
            return 'I could not attach a runnable phone preview from that response. Ask me to rebuild it, and I will return an in-app Live Preview instead of desktop localhost steps.';
        }

        return preg_replace(
            '/(?:open|visit|go to|navigate to|load|view|preview|run|check)\b[^.\n]*(?:localhost|127\.0\.0\.1|0\.0\.0\.0)[^.\n]*(?:[.\n]|$)/i',
            'Open it from the in-app Live Preview card instead.',
            $reply
        ) ?: $reply;
    }

    private function mentionsLocalhostPreview(string $reply): bool
    {
        return (bool) preg_match('/\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0)\b/i', $reply)
            && (bool) preg_match('/\b(?:open|visit|go to|navigate to|load|view|preview|browser|url|http:\/\/|https:\/\/)\b/i', $reply);
    }

    private function isLocalDevelopmentPrompt(string $prompt): bool
    {
        return (bool) preg_match('/\b(?:backend|api|server|localhost|127\.0\.0\.1|port|terminal|command|npm|composer|artisan|expo|dev\s+server|environment|env|setup|install|run\s+locally|local\s+development)\b/i', $prompt);
    }

    private function isPreviewPrompt(string $prompt): bool
    {
        return (bool) preg_match('/\b(?:app|website|web\s*site|site|page|preview|live\s+preview|open|view|show|launch|run|phone|mobile|device)\b/i', $prompt);
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
