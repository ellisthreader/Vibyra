<?php

namespace App\Services;

use App\Services\Moderation\LocalTextRules;
use App\Services\Moderation\ModerationDecisions;
use App\Services\Moderation\RemoteModeration;

class ContentModeration
{
    use LocalTextRules;
    use ModerationDecisions;
    use RemoteModeration;

    public function assertTextAllowed(string $text, string $surface = 'user input'): void
    {
        $text = trim($text);

        if ($text === '' || ! $this->enabled()) {
            return;
        }

        $this->assertDecisionAllowed($this->checkText($text, $surface));
    }

    public function assertLocalTextAllowed(string $text, string $surface = 'user input'): void
    {
        $text = trim($text);

        if ($text === '' || ! $this->localModerationEnabled()) {
            return;
        }

        $this->assertDecisionAllowed($this->localTextDecision($text, $surface));
    }

    public function assertFieldsAllowed(array $fields, string $surface = 'user input'): void
    {
        foreach ($fields as $field => $value) {
            if (is_string($value)) {
                $this->assertTextAllowed($value, $surface.'.'.$field);
            }
        }
    }

    public function assertModerationInputAllowed(array $input, string $surface = 'user upload', ?bool $failClosed = null): array
    {
        $items = $this->moderationItems($input);

        if ($items === []) {
            return $this->allowedDecision($surface);
        }

        if ($this->localModerationEnabled()) {
            foreach ($items as $item) {
                if (($item['type'] ?? '') === 'text') {
                    $this->assertDecisionAllowed($this->localTextDecision((string) $item['text'], $surface));
                }
            }
        }

        $decision = $this->remoteModerationEnabled()
            ? $this->remoteDecision($items, $surface, $failClosed)
            : $this->allowedDecision($surface, 'OpenAI moderation is disabled; local comment filters were applied.');
        $this->assertDecisionAllowed($decision);

        return $decision;
    }

    public function checkText(string $text, string $surface = 'user input'): array
    {
        $localDecision = $this->localModerationEnabled()
            ? $this->localTextDecision($text, $surface)
            : $this->allowedDecision($surface);

        if (! $localDecision['allowed']) {
            return $localDecision;
        }

        return $this->remoteModerationEnabled()
            ? $this->remoteDecision($text, $surface)
            : $localDecision;
    }
}
