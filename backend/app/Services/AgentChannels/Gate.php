<?php
namespace App\Services\AgentChannels;
use App\Services\AgentRuns\{Access, ApiError};
use App\Services\AgentRuns\Jobs\Membership;
final class Gate
{
    public static function require(int $userId): void
    {
        if (!config('agents_v2.channels_enabled')) ApiError::throw(503, 'channels_disabled', 'Channel conversations are not enabled.');
        app(Access::class)->require($userId); Membership::require($userId);
    }
    public static function providers(): array
    {
        return array_map(fn ($p) => ['provider'=>$p,'configured'=>self::configured($p),'reason'=>self::configured($p)?null:'provider_setup_required'], ['slack']);
    }
    public static function configured(string $provider): bool
    {
        if ($provider === 'slack') return preg_match('/^A[A-Z0-9]{5,30}$/D', (string) config('agent_channels.slack_app_id'))
            && (string) config('agents_v2.slack_signing_secret') !== '';
        return false;
    }
    public static function provider(string $provider): void
    {
        if ($provider !== 'slack') ApiError::throw(410, 'provider_removed', 'This integration has been removed.');
        if (!self::configured($provider)) ApiError::throw(409,'provider_setup_required','This channel provider needs its bot application configured first.');
    }
}
