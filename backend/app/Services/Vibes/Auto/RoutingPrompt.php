<?php

namespace App\Services\Vibes\Auto;

/** Short approvals continue the task; they must not reset its difficulty to a greeting. */
final class RoutingPrompt
{
    public static function from(string $text, array $messages): string
    {
        if (! self::continuation($text)) return $text;
        // Skip the current message and use the latest substantive user request.
        // Assistant/tool text is never used to redefine the person's task.
        foreach (array_reverse(array_slice($messages, 0, -1)) as $message) {
            if (($message['role'] ?? null) !== 'user') continue;
            $content = $message['content'] ?? '';
            if (! is_string($content) || self::continuation($content)) continue;
            return mb_substr($content, 0, 4000)."\n".$text;
        }
        return $text;
    }

    private static function continuation(string $text): bool
    {
        return (bool) preg_match('/^(?:(?:yes|ok|okay|sure|please)[,\s]*)*(?:(?:continue|go on|go ahead|proceed|carry on|keep going|do it|try again|finish it|fix it)[.!?\s]*)?$/iu', trim($text));
    }
}
