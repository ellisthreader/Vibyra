<?php
namespace Tests\Feature;

use App\Services\LiveActivities\{ApnsJwt, ContentState, Payloads};
use Tests\Support\LiveActivityFixtures;
use Tests\TestCase;

/** Pure mapping and payload rules: no database, no network. */
class LiveActivitiesPayloadTest extends TestCase
{
    public function test_every_run_state_maps_to_one_of_eight_phases_and_cancelled_has_none(): void
    {
        $expected = ['queued' => 'queued', 'waiting_for_computer' => 'waiting_computer', 'starting' => 'working', 'running' => 'working',
            'waiting_for_tool' => 'working', 'waiting_for_approval' => 'needs_approval', 'waiting_for_signin' => 'needs_signin',
            'paused_by_limits' => 'paused', 'completed' => 'finished', 'failed' => 'failed', 'outcome_unknown' => 'failed'];
        foreach ($expected as $state => $phase) $this->assertSame($phase, ContentState::phase($state), $state);
        $this->assertNull(ContentState::phase('cancelled'));
        $this->assertEqualsCanonicalizing(ContentState::PHASES, array_unique(array_values($expected)));
    }

    public function test_content_state_is_name_and_state_only_unless_details_are_on(): void
    {
        $run = ['state' => 'waiting_for_tool', 'since' => 100, 'finished_at' => null, 'tool_kind' => 'write'];
        $plain = ContentState::for($run, false, 'Checkout', 200);
        $this->assertSame(['phase' => 'working', 'since' => 100], $plain);
        $detailed = ContentState::for($run, true, 'Checkout', 200);
        $this->assertSame(['phase' => 'working', 'since' => 100, 'phrase' => 'acting', 'project' => 'Checkout'], $detailed);
        $this->assertContains($detailed['phrase'], ContentState::PHRASES);
    }

    public function test_an_unconfirmed_outcome_says_so_even_without_details(): void
    {
        $state = ContentState::for(['state' => 'outcome_unknown', 'since' => 100, 'finished_at' => 160, 'tool_kind' => null], false, null, 200);
        $this->assertSame(['phase' => 'failed', 'since' => 100, 'endedAt' => 160, 'phrase' => 'unconfirmed'], $state);
    }

    public function test_priority_10_only_when_a_person_is_needed_or_the_run_ended(): void
    {
        $priority = fn (string $state) => Payloads::update(ContentState::for(['state' => $state, 'since' => 1, 'finished_at' => 9, 'tool_kind' => null], false, null, 10), 'Review', 10)[1];
        foreach (['waiting_for_approval', 'waiting_for_signin', 'completed', 'failed'] as $state) $this->assertSame(10, $priority($state), $state);
        foreach (['queued', 'waiting_for_computer', 'running', 'waiting_for_tool', 'paused_by_limits'] as $state) $this->assertSame(5, $priority($state), $state);
    }

    public function test_stale_relevance_alert_and_dismissal_rules(): void
    {
        config(['live_activities.stale_minutes' => 45, 'live_activities.person_stale_minutes' => 15, 'live_activities.finished_minutes' => 15]);
        $at = fn (string $state) => Payloads::update(ContentState::for(['state' => $state, 'since' => 1, 'finished_at' => 90, 'tool_kind' => null], false, null, 100), 'Review', 100)[0]['aps'];
        $working = $at('running');
        $this->assertSame(100 + 45 * 60, $working['stale-date']);
        $this->assertSame(50, $working['relevance-score']);
        $this->assertArrayNotHasKey('alert', $working);
        $approval = $at('waiting_for_approval');
        $this->assertSame(100 + 15 * 60, $approval['stale-date']);
        $this->assertSame(100, $approval['relevance-score']);
        $this->assertSame('Review needs your approval', $approval['alert']['title']);
        $finished = $at('completed');
        $this->assertSame('end', $finished['event']);
        $this->assertSame(100 + 15 * 60, $finished['dismissal-date']);
        $failed = $at('failed');
        $this->assertSame('end', $failed['event']);
        $this->assertArrayNotHasKey('dismissal-date', $failed, 'a failed card stays until seen (system default)');
        $this->assertLessThan(100, Payloads::remove(['phase' => 'failed', 'since' => 1], 100)['aps']['dismissal-date']);
    }

    public function test_no_payload_is_anywhere_near_the_4kb_activitykit_limit(): void
    {
        foreach (LiveActivityFixtures::all() as $name => $body) $this->assertLessThan(1200, strlen(json_encode($body)), $name);
    }

    public function test_payloads_match_the_committed_fixtures_the_swift_test_decodes(): void
    {
        if (getenv('UPDATE_LIVE_ACTIVITY_FIXTURES')) LiveActivityFixtures::write();
        foreach (LiveActivityFixtures::all() as $name => $body) {
            $file = LiveActivityFixtures::DIR."/$name.json";
            $this->assertFileExists($file, $name);
            $this->assertSame(json_decode(file_get_contents($file), true), json_decode(json_encode($body), true), $name);
        }
        $this->assertCount(count(LiveActivityFixtures::all()), glob(LiveActivityFixtures::DIR.'/*.json'));
    }

    public function test_the_provider_token_is_a_valid_es256_jwt(): void
    {
        $key = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1']);
        openssl_pkey_export($key, $pem);
        config(['live_activities.apns.key' => $pem, 'live_activities.apns.key_id' => 'KEY1234567', 'live_activities.apns.team_id' => 'TEAM123456']);
        $jwt = new ApnsJwt();
        $this->assertTrue($jwt->configured());
        [$h, $c, $s] = explode('.', $jwt->token(1760000000));
        $dec = fn ($x) => json_decode(base64_decode(strtr($x, '-_', '+/')), true);
        $this->assertSame(['alg' => 'ES256', 'kid' => 'KEY1234567'], $dec($h));
        $this->assertSame(['iss' => 'TEAM123456', 'iat' => 1760000000], $dec($c));
        $raw = base64_decode(strtr($s, '-_', '+/'));
        $this->assertSame(64, strlen($raw));
        $int = fn (string $b) => (ord($b[0]) & 0x80 ? "\x00" : '').$b;
        $r = $int(ltrim(substr($raw, 0, 32), "\x00")); $sPart = $int(ltrim(substr($raw, 32), "\x00"));
        $der = "\x30".chr(strlen($r) + strlen($sPart) + 4)."\x02".chr(strlen($r)).$r."\x02".chr(strlen($sPart)).$sPart;
        $this->assertSame(1, openssl_verify("$h.$c", $der, openssl_pkey_get_details($key)['key'], OPENSSL_ALGO_SHA256));
        $this->assertSame($jwt->token(1760000100), "$h.$c.$s", 'reused inside forty minutes');
        $this->assertNotSame("$h.$c.$s", $jwt->token(1760000000 + 2401));
    }

    public function test_a_missing_key_is_not_configured_and_the_key_text_never_appears_in_config_defaults(): void
    {
        config(['live_activities.apns.key' => null, 'live_activities.apns.key_path' => null]);
        $this->assertFalse((new ApnsJwt())->configured());
        $this->assertNull(config('live_activities.apns.key'));
    }
}
