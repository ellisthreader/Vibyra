<?php
namespace Tests\Support;

use App\Services\LiveActivities\{ContentState, Payloads};

/**
 * The exact payloads the backend sends, built at a fixed clock. They are committed as JSON in
 * tests/Fixtures/live-activity and decoded by the Swift test in mobile/modules/vibyra-activity/tests,
 * so the server and the widget cannot drift. Regenerate with UPDATE_LIVE_ACTIVITY_FIXTURES=1.
 */
final class LiveActivityFixtures
{
    public const NOW = 1760000000;
    public const DIR = __DIR__.'/../Fixtures/live-activity';

    private static function run(string $state, array $extra = []): array
    {
        return ['state' => $state, 'since' => self::NOW - 192, 'finished_at' => null, 'tool_kind' => null, ...$extra];
    }

    /** @return array<string,array> name => body */
    public static function all(): array
    {
        config(['live_activities.stale_minutes' => 45, 'live_activities.person_stale_minutes' => 15, 'live_activities.finished_minutes' => 15,
            'live_activities.attributes_type' => 'VibyraRunAttributes']);
        $n = self::NOW;
        $update = fn (array $run, bool $details = false) => Payloads::update(ContentState::for($run, $details, $details ? 'Checkout' : null, $n), 'Review', $n)[0];
        $ended = fn (string $state) => self::run($state, ['since' => $n - 252, 'finished_at' => $n - 30]);
        return [
            'update-queued' => $update(self::run('queued')),
            'update-working' => $update(self::run('running')),
            'update-working-details' => $update(self::run('waiting_for_tool', ['tool_kind' => 'read']), true),
            'update-waiting-computer' => $update(self::run('waiting_for_computer')),
            'update-needs-approval' => $update(self::run('waiting_for_approval')),
            'update-needs-signin' => $update(self::run('waiting_for_signin')),
            'update-paused' => $update(self::run('paused_by_limits')),
            'end-finished' => Payloads::update(ContentState::for($ended('completed'), false, null, $n), 'Review', $n)[0],
            'end-failed' => Payloads::update(ContentState::for($ended('failed'), false, null, $n), 'Review', $n)[0],
            'end-unconfirmed' => Payloads::update(ContentState::for($ended('outcome_unknown'), false, null, $n), 'Review', $n)[0],
            'start-working' => Payloads::start(ContentState::for(self::run('running'), false, null, $n),
                Payloads::attributes('0b9f6a3e-1111-4b0e-9d11-000000000001', '0b9f6a3e-2222-4b0e-9d11-000000000002', 'Review', 'review'), $n),
            'remove-cancelled' => Payloads::remove(['phase' => 'failed', 'since' => $n], $n),
        ];
    }

    public static function write(): void
    {
        foreach (self::all() as $name => $body) {
            file_put_contents(self::DIR."/$name.json", json_encode($body, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)."\n");
        }
    }
}
