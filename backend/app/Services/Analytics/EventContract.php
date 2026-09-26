<?php

namespace App\Services\Analytics;

use Illuminate\Validation\ValidationException;

class EventContract
{
    private const FIELDS = [
        'desktop_app_opened' => ['platform', 'app_version'],
        'desktop_project_created' => ['project_kind'],
        'desktop_terminal_started' => ['provider', 'model'],
        'desktop_prompt_submitted' => ['provider', 'model'],
        'desktop_engagement_interval' => ['seconds'],
        'desktop_project_opened' => [],
        'desktop_preview_opened' => [],
        'mobile_app_opened' => ['platform', 'app_version'],
        'mobile_chat_prompt_sent' => ['model', 'effort'],
        'mobile_project_prompt_sent' => ['provider', 'session_type'],
        'mobile_screen_viewed' => ['screen'],
        'mobile_engagement_interval' => ['seconds'],
        'mobile_project_created' => ['project_kind'],
        'mobile_preview_opened' => [],
        'mobile_pairing_started' => [],
        'mobile_pairing_completed' => ['result'],
        'mobile_integration_started' => ['provider'],
        'mobile_upgrade_clicked' => [],
    ];

    public function validate(string $surface, string $event, array $properties): ?string
    {
        if (! isset(self::FIELDS[$event]) || ! str_starts_with($event, $surface.'_')) {
            throw ValidationException::withMessages(['event' => 'Unsupported analytics event.']);
        }
        if (array_diff(array_keys($properties), self::FIELDS[$event]) !== []
            || count($properties) > 3) {
            throw ValidationException::withMessages(['properties' => 'Unsupported analytics properties.']);
        }

        foreach ($properties as $key => $value) {
            if ($key === 'seconds') {
                if (! is_int($value) || $value < 1 || $value > 60) {
                    throw ValidationException::withMessages(['properties.seconds' => 'Use 1 to 60 engaged seconds.']);
                }
                continue;
            }
            if (! is_string($value) || strlen($value) > 80 || $value === ''
                || str_contains($value, '..') || str_contains($value, '://')
                || str_contains($value, '\\') || str_starts_with($value, '/')) {
                throw ValidationException::withMessages(["properties.{$key}" => 'Use a short public identifier.']);
            }
            $pattern = match ($key) {
                'model' => '/^[A-Za-z0-9][A-Za-z0-9._+\-]{0,39}(?:\/[A-Za-z0-9][A-Za-z0-9._+\-]{0,39})?$/D',
                'app_version' => '/^[0-9][A-Za-z0-9.+\-]{0,31}$/D',
                default => '/^[a-z0-9][a-z0-9_-]{0,39}$/D',
            };
            if (! preg_match($pattern, $value)) {
                throw ValidationException::withMessages(["properties.{$key}" => 'Use a short public identifier.']);
            }
            if ($key === 'platform' && ! in_array($value, $surface === 'desktop'
                ? ['macos', 'windows', 'linux'] : ['ios', 'android', 'web'], true)) {
                throw ValidationException::withMessages(['properties.platform' => 'Unsupported platform.']);
            }
            if ($key === 'screen' && ! in_array($value,
                ['home', 'chat', 'projects', 'remote', 'settings', 'account', 'wallet', 'agents', 'explore', 'integrations'], true)) {
                throw ValidationException::withMessages(['properties.screen' => 'Unsupported screen.']);
            }
            if ($key === 'effort' && ! in_array($value,
                ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'], true)) {
                throw ValidationException::withMessages(['properties.effort' => 'Unsupported effort.']);
            }
            if ($key === 'session_type' && $value !== 'conversation') {
                throw ValidationException::withMessages(['properties.session_type' => 'Unsupported session type.']);
            }
            if ($key === 'result' && ! in_array($value, ['success', 'failure'], true)) {
                throw ValidationException::withMessages(['properties.result' => 'Unsupported result.']);
            }
            if ($event === 'mobile_integration_started' && $key === 'provider'
                && ! in_array($value, [
                    'github', 'stripe', 'figma', 'gmail', 'google_calendar',
                    'google_drive', 'google_tasks', 'notion', 'deepwiki',
                ], true)) {
                throw ValidationException::withMessages(['properties.provider' => 'Unsupported integration.']);
            }
        }

        return $properties['model'] ?? $properties['platform'] ?? $properties['screen']
            ?? $properties['provider'] ?? $properties['project_kind'] ?? null;
    }
}
