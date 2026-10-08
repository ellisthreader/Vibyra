<?php
// Roadmap Part 13: real forked processes against one disposable PostgreSQL. SQLite cannot prove any of this.
require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use App\Models\{Organization, OrganizationInvitation, OrganizationMember, User};
use App\Services\Teams\{Invitations, Organizations, Roles};
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\{DB, Notification};
use Illuminate\Support\Str;
if (DB::connection()->getConfig('host') !== '127.0.0.1' || DB::connection()->getDriverName() !== 'pgsql' || DB::connection()->getDatabaseName() !== 'vibyra_teams_qa') throw new Exception('Isolated QA database required');
config(['teams.enabled' => true, 'platform.activity' => true]);
function check($ok, $message) { if (!$ok) throw new Exception("FAIL $message"); echo "PASS $message\n"; }
function race(array $jobs): array {
    DB::disconnect(); $children = []; $paths = [];
    $start = microtime(true) + 0.3;
    foreach ($jobs as $job) {
        $path = tempnam(sys_get_temp_dir(), 'teams-race-'); $paths[] = $path;
        $pid = pcntl_fork();
        if ($pid === 0) {
            DB::purge(); while (microtime(true) < $start) usleep(500);
            try { $job(); $r = ['ok' => true]; }
            catch (HttpResponseException $e) { $r = ['ok' => false, 'status' => $e->getResponse()->getStatusCode(), 'code' => $e->getResponse()->getData()->code ?? null]; }
            catch (Throwable $e) { $r = ['ok' => false, 'status' => 500, 'code' => get_class($e).': '.$e->getMessage()]; }
            file_put_contents($path, json_encode($r)); exit(0);
        }
        $children[] = $pid;
    }
    foreach ($children as $pid) pcntl_waitpid($pid, $status);
    DB::purge(); $out = [];
    foreach ($paths as $path) { $out[] = json_decode(file_get_contents($path), true); unlink($path); }
    return $out;
}
$wins = fn (array $r) => count(array_filter($r, fn ($v) => $v['ok']));
$codes = fn (array $r) => array_values(array_unique(array_filter(array_map(fn ($v) => $v['code'] ?? null, $r))));
$person = fn (?string $email = null) => User::factory()->create(['email' => $email ?? Str::random(8).'@acme.test', 'email_verified_at' => now()]);
$team = function (int $owners = 1) use ($person) {
    $org = (new Organization)->forceFill(['name' => 'QA']); $org->save();
    $users = [];
    for ($i = 0; $i < $owners; $i++) { $u = $person(); (new OrganizationMember)->forceFill(['organization_id' => $org->id, 'user_id' => $u->id, 'role' => 'owner'])->save(); $users[] = $u; }
    return [$org, $users];
};
$invite = function (Organization $org, User $by, string $email, string $role = 'member') {
    $token = 'vti_'.Str::random(48);
    (new OrganizationInvitation)->forceFill(['organization_id' => $org->id, 'email' => $email, 'role' => $role, 'token_hash' => Invitations::hash($token),
        'invited_by' => $by->id, 'expires_at' => now()->addDays(7)])->save();
    return $token;
};

// 1. One link, many simultaneous accepts by the same person (two browser tabs, a double click): one seat, one use.
[$org, [$owner]] = $team();
$bob = $person('bob@acme.test');
$token = $invite($org, $owner, 'bob@acme.test');
$r = race(array_fill(0, 6, fn () => app(Invitations::class)->accept(User::find($bob->id), $token)));
check($wins($r) === 1 && OrganizationMember::where('user_id', $bob->id)->count() === 1, 'six simultaneous accepts of one link seat the person once');
check(array_diff($codes($r), ['invite_used', 'invite_invalid', 'already_in_team']) === [], 'the others are refused cleanly ('.implode(',', $codes($r)).')');
check(OrganizationInvitation::whereNotNull('accepted_at')->count() === 1, 'the link is marked used exactly once');

// 2. More simultaneous accepts than seats: exactly the free seats are filled, never more.
[$org, [$owner]] = $team();
$org->forceFill(['seats' => 4])->save();
$people = []; $jobs = [];
for ($i = 0; $i < 8; $i++) { $u = $person("p$i@acme.test"); $t = $invite($org, $owner, "p$i@acme.test"); $jobs[] = fn () => app(Invitations::class)->accept(User::find($u->id), $t); }
$r = race($jobs);
check($wins($r) === 3 && OrganizationMember::where('organization_id', $org->id)->count() === 4, 'eight racing accepts into three free seats admit exactly three');
check(in_array('no_seats', $codes($r), true), 'the rest are told there is no free seat');

// 3. Two owners leave at the same moment: exactly one may; an owner always remains.
[$org, [$a, $b]] = $team(2);
$r = race([fn () => app(Organizations::class)->leave(User::find($a->id)), fn () => app(Organizations::class)->leave(User::find($b->id))]);
check($wins($r) === 1 && $codes($r) === ['last_owner'], 'two owners leaving together: one leaves, the other is the last owner');
check(OrganizationMember::where('organization_id', $org->id)->where('role', 'owner')->count() === 1, 'one owner remains');

// 4. Many owners all leave together: exactly (n-1) succeed.
[$org, $owners] = $team(5);
$r = race(array_map(fn ($u) => fn () => app(Organizations::class)->leave(User::find($u->id)), $owners));
check($wins($r) === 4 && OrganizationMember::where('organization_id', $org->id)->count() === 1, 'five owners leaving together: four go, one stays');

// 5. Two owners demote each other at once: one wins, the loser is no longer an owner and is refused.
[$org, [$a, $b]] = $team(2);
$seat = fn (User $u) => OrganizationMember::where('user_id', $u->id)->first()->id;
$r = race([fn () => app(Organizations::class)->changeRole(User::find($a->id), $seat($b), 'member'), fn () => app(Organizations::class)->changeRole(User::find($b->id), $seat($a), 'member')]);
check($wins($r) === 1 && OrganizationMember::where('organization_id', $org->id)->where('role', 'owner')->count() === 1, 'two owners demoting each other: exactly one survives as owner');

// 6. An owner leaves while the other is demoted by a third request: the team never ends with no owner.
[$org, [$a, $b]] = $team(2);
$r = race([fn () => app(Organizations::class)->leave(User::find($a->id)), fn () => app(Organizations::class)->changeRole(User::find($a->id), $seat($b), 'admin')]);
check(OrganizationMember::where('organization_id', $org->id)->where('role', 'owner')->count() >= 1, 'leave racing a demotion never leaves a team without an owner');

// 7. Two creates by one person at once: one team.
$solo = $person();
$before = Organization::count();
$r = race([fn () => app(Organizations::class)->create(User::find($solo->id), 'One'), fn () => app(Organizations::class)->create(User::find($solo->id), 'Two'), fn () => app(Organizations::class)->create(User::find($solo->id), 'Three')]);
check($wins($r) === 1 && Organization::count() === $before + 1 && OrganizationMember::where('user_id', $solo->id)->count() === 1, 'three simultaneous creates make one team');

// 8. Racing invitations to the last seat: pending invites hold seats, so exactly one is accepted into the seat they share.
[$org, [$owner]] = $team();
$org->forceFill(['seats' => 2])->save();
$r = race(array_map(fn ($i) => fn () => app(Invitations::class)->invite(User::find($owner->id), "inv$i@acme.test", 'member'), range(1, 5)));
check($wins($r) === 1 && OrganizationInvitation::where('organization_id', $org->id)->whereNull('revoked_at')->count() === 1, 'five racing invitations into one free seat: one is created');
echo "ALL PASS\n";
