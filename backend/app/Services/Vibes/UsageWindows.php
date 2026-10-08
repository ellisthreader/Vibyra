<?php

namespace App\Services\Vibes;

use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * The two rolling usage windows: a session (5 hours) and a week (7 days). They
 * bound how fast an account may spend, never how much — the balance is still the
 * only thing that says how much, and every Vibe in it is still spendable.
 *
 * Rolling rather than calendar, and derived rather than counted. There is no
 * `*_used` column and no `reset_at` to keep in step: a window is a `SUM` over the
 * turns inside it, so spend ages out continuously, a refund at settle returns to
 * the window by itself, and there is no midnight for the whole userbase to queue
 * against. `vibes_turns(user_id, created_at)` is the index that makes that cheap.
 *
 * An unsettled turn counts what it reserved and a settled one counts what it was
 * actually charged. That is deliberate on both sides: a reply in flight cannot be
 * spent twice, and the unused part of a reservation comes back to the window the
 * moment the turn settles rather than at the end of the window.
 */
class UsageWindows
{
    public function __construct(private readonly Plans $plans) {}

    /** How long each window looks back. Config owns both; nothing here does. */
    public static function sessionHours(): int
    {
        return max(1, (int) config('vibes.limits.session_hours', 5));
    }

    public static function weekDays(): int
    {
        return max(1, (int) config('vibes.limits.week_days', 7));
    }

    /**
     * Both windows as the wallet publishes them, so the phone renders the figures
     * the backend enforces instead of keeping its own copy of them.
     */
    public function payload(int $userId, string $plan): array
    {
        $entitlements = $this->plans->for($plan);

        return [
            'session' => ['hours' => self::sessionHours(), 'limit' => $entitlements['sessionCredits'],
                ...$this->measure($userId, self::sessionStart(), self::sessionHours() * 60)],
            'week' => ['days' => self::weekDays(), 'limit' => $entitlements['weekCredits'],
                ...$this->measure($userId, self::weekStart(), self::weekDays() * 24 * 60)],
        ];
    }

    /**
     * Refuses a turn that would cross either window. Called inside `Turns::submit`'s
     * transaction, under the account's wallet lock, so two sends racing each other
     * cannot both read the same headroom and both take it.
     *
     * The session is checked first because it is the one that frees up soonest, and
     * saying "3 days" when 2 hours would have done is the difference between waiting
     * and cancelling a subscription.
     */
    public function guard(int $userId, string $plan, int $credits): void
    {
        $entitlements = $this->plans->for($plan);
        $this->enforce($userId, self::sessionStart(), self::sessionHours() * 60,
            $entitlements['sessionCredits'], $credits, self::sessionHours().'-hour');
        $this->enforce($userId, self::weekStart(), self::weekDays() * 24 * 60,
            $entitlements['weekCredits'], $credits, self::weekDays().'-day');
    }

    private static function sessionStart(): CarbonInterface
    {
        return now()->subHours(self::sessionHours());
    }

    private static function weekStart(): CarbonInterface
    {
        return now()->subDays(self::weekDays());
    }

    private function enforce(int $userId, CarbonInterface $since, int $minutes, int $limit, int $credits, string $named): void
    {
        $window = $this->measure($userId, $since, $minutes);
        if ($window['used'] + $credits <= $limit) return;
        // `resetsAt` is when the oldest spend in this window ages out of it, which
        // is the first moment any headroom returns. It is never null here: being
        // over the limit means something is in the window.
        $free = $window['resetsAt'] === null ? '' : ' More free up in about '.self::inWords(Carbon::parse($window['resetsAt'])).'.';
        abort(429, 'Your '.$named.' Vibes limit is reached.'.$free);
    }

    /**
     * One window's spend, and when the oldest of it leaves. Both come from the same
     * scan, because a page that shows a meter and a guard that reads the same figure
     * should not be two round trips.
     */
    private function measure(int $userId, CarbonInterface $since, int $minutes): array
    {
        $row = DB::table('vibes_turns')->where('user_id', $userId)
            ->where('created_at', '>=', $since->format('Y-m-d H:i:s'))
            ->selectRaw('COALESCE(SUM(CASE WHEN settled_at IS NULL THEN reserved ELSE charged END), 0) as used')
            ->selectRaw('MIN(created_at) as oldest')
            ->first();
        $used = max(0, (int) ($row->used ?? 0));

        return ['used' => $used, 'resetsAt' => $used > 0 && $row?->oldest
            ? Carbon::parse($row->oldest)->addMinutes($minutes)->toIso8601String() : null];
    }

    /**
     * "2 hours". Said as a duration rather than a clock time because the backend
     * does not know the phone's timezone, and "18:00" in the wrong one is worse
     * than no answer at all.
     */
    private static function inWords(CarbonInterface $when): string
    {
        $minutes = max(1, (int) ceil(abs(now()->diffInSeconds($when)) / 60));
        if ($minutes < 60) return $minutes.($minutes === 1 ? ' minute' : ' minutes');
        $hours = (int) ceil($minutes / 60);
        if ($hours < 48) return $hours.($hours === 1 ? ' hour' : ' hours');

        return (int) ceil($hours / 24).' days';
    }
}
