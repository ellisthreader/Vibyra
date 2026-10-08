<?php

use App\Models\AgentV2\Connection;
use Illuminate\Support\Facades\{Crypt, DB};

/** Refresh serialization and dispatch snapshots against real PostgreSQL locks. No real provider is contacted. */
final class ConcCredentials
{
    public static function run(): void
    {
        Conc::$scenario = 'credential boundaries';
        foreach ([true, false] as $legacy) {
            $fx = ConcFixture::make(false);
            $refresh = 'refresh-'.$fx['user'];
            if ($legacy) {
                $row = Connection::query()->findOrFail(ConcFixture::gmailInstall($fx['user']));
                DB::table('vibes_integration_installs')->where('id', $row->install_id)->update([
                    'refresh_token' => Crypt::encryptString($refresh), 'expires_at' => now()->addMinute()]);
            } else {
                $row = Connection::query()->create(['user_id' => $fx['user'], 'provider' => 'gmail', 'external_identity' => 'extra@example.com',
                    'generation' => 1, 'capability_revision' => 1, 'health' => 'healthy', 'credential' => Crypt::encryptString('expired'),
                    'refresh_token' => Crypt::encryptString($refresh), 'expires_at' => now()->addMinute()]);
            }
            $job = ['op' => 'credential', 'snapshot' => $row->getAttributes(), 'expected' => 'refreshed-'.$refresh];
            $jobs = array_fill(0, 8, $job);
            if ($legacy) $jobs = [...$jobs, ...array_fill(0, 8, [...$job, 'legacy' => true])];
            $race = ConcRace::run($jobs);
            $matches = count(array_filter($race, fn ($r) => ($r['result']['matched'] ?? false) === true));
            $refreshes = ConcFakes::count('GOOGLE_REFRESH', $refresh);
            Conc::check(($legacy ? '8 Agent + 8 ordinary-chat' : '8 named-account').' calls share one token refresh',
                $matches === count($jobs) && $refreshes === 1, 'matches='.$matches.' refreshes='.$refreshes);

            // Retain the admitted snapshot; mutate the credential store before workers resolve it.
            if ($legacy) DB::table('vibes_integration_installs')->where('id', $row->install_id)->update([
                'account_label' => 'replacement@example.com', 'credential' => Crypt::encryptString('replacement')]);
            else Connection::query()->whereKey($row->id)->update(['generation' => 2, 'credential' => Crypt::encryptString('replacement')]);
            $race = ConcRace::run(array_fill(0, 8, $job));
            $refused = count(array_filter($race, fn ($r) => ($r['result']['refused'] ?? null) === 'access_changed'));
            Conc::check('8 stale '.($legacy ? 'legacy-install' : 'named-account').' snapshots refuse the replacement credential',
                $refused === 8 && ConcFakes::count('GOOGLE_REFRESH', $refresh) === 1, 'refused='.$refused);
        }
        self::sameSecondReconnect();
    }

    private static function sameSecondReconnect(): void
    {
        $fx = ConcFixture::make(false);
        $row = Connection::query()->findOrFail(ConcFixture::gmailInstall($fx['user']));
        $read = ['op' => 'credential', 'snapshot' => $row->getAttributes(), 'expected' => 'tok-'.$fx['user']];
        $write = ['op' => 'install_replace', 'user' => $fx['user'], 'identity' => $row->external_identity,
            'at' => $row->install_connected_at->format('Y-m-d H:i:s')];
        $race = ConcRace::run([...array_fill(0, 8, $read), ...array_fill(0, 4, $write)]);
        $safeReads = count(array_filter(array_slice($race, 0, 8), fn ($r) => ($r['result']['matched'] ?? false) === true
            || ($r['result']['refused'] ?? null) === 'access_changed'));
        $writes = count(array_filter(array_slice($race, 8), fn ($r) => ($r['result']['reconnected'] ?? false) === true));
        Conc::check('4 same-second reconnects race 8 admitted credential reads: old token or refusal, never replacement; all epochs counted',
            $safeReads === 8 && $writes === 4 && $row->fresh()->generation === 5,
            'safeReads='.$safeReads.' writes='.$writes.' generation='.$row->fresh()->generation);
    }
}
