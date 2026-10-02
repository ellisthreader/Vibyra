<?php
namespace App\Services\Assistant;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Persistent reservations: cache clearing, retries and worker death never create free spend. */
final class Budget
{
    public function reserve(int $user, string $request, string $kind, int $cost): string
    {
        if ($cost <= 0) throw new \InvalidArgumentException('A positive reservation is required.');
        app(Tokens::class)->prepare($user);
        return DB::transaction(function () use ($user, $request, $kind, $cost) {
            app(Tokens::class)->lock($user);
            $guard = DB::table('assistant_controls')->where('id', 1)->lockForUpdate()->first();
            if (!$guard || $guard->tripped) Failure::raise(503, 'assistant_paused', 'The Vibyra assistant is temporarily unavailable.');
            if (DB::table('assistant_requests')->where('user_id', $user)->where('request_id', $request)->exists()) {
                Failure::raise(409, 'assistant_duplicate', 'This request was already received. Start a new request to try again.');
            }
            $active = DB::table('assistant_requests')->where('state', 'reserved')->where('created_at', '>', now()->subMinutes(3));
            $plan = app(\App\Services\Vibes\Wallet::class)->planFor($user);
            $slots = min(config('assistant.user_concurrent_calls'), app(\App\Services\Vibes\Plans::class)->for($plan)['concurrentReplies']);
            $other = DB::table('vibes_turns')->where('user_id', $user)->whereNull('settled_at')->count();
            if ((clone $active)->count() >= config('assistant.concurrent_calls')
                || $active->where('user_id', $user)->count() + $other >= $slots) {
                Failure::raise(429, 'assistant_busy', 'Please wait for the current assistant request to finish.');
            }
            $limits = $this->limits($user);
            foreach ($limits as $key => [$money, $calls]) {
                $bucket = DB::table('assistant_buckets')->where('id', $key)->first();
                if (($bucket->micro_usd ?? 0) + $cost > $money || ($bucket->calls ?? 0) >= $calls) {
                    if (str_starts_with($key, 'month:')) Failure::raise(503, 'assistant_capacity', 'Vibyra AI is at capacity. Your tokens remain available; please try again later.');
                    Failure::raise(429, 'assistant_limit', 'Too many assistant requests. Please try again after the request limit resets.');
                }
            }
            foreach ($limits as $key => $_) {
                DB::table('assistant_buckets')->insertOrIgnore(['id' => $key]);
                DB::table('assistant_buckets')->where('id', $key)->incrementEach(['micro_usd' => $cost, 'calls' => 1]);
            }
            $id = (string) Str::uuid();
            $tokens = app(Tokens::class)->hold($user, $id, $cost);
            DB::table('assistant_requests')->insert(['id' => $id, 'user_id' => $user, 'request_id' => $request,
                'kind' => $kind, 'reserved_micro_usd' => $cost, 'buckets' => json_encode(array_keys($limits)), 'created_at' => now(), ...$tokens]);
            return $id;
        }, 5);
    }

    public function finish(string $id, ?int $actual): void
    {
        DB::transaction(function () use ($id, $actual) {
            $original = DB::table('assistant_requests')->where('id', $id)->first();
            if (!$original) return;
            if ($original->user_id) app(Tokens::class)->lock($original->user_id);
            DB::table('assistant_controls')->where('id', 1)->lockForUpdate()->first();
            $row = DB::table('assistant_requests')->where('id', $id)->lockForUpdate()->first();
            if (!$row || $row->state !== 'reserved') return;
            $charged = max(0, $actual ?? $row->reserved_micro_usd);
            $difference = $charged - $row->reserved_micro_usd;
            foreach (json_decode($row->buckets, true) as $key) {
                DB::table('assistant_buckets')->where('id', $key)->increment('micro_usd', $difference);
            }
            // Unexpected pricing stops new admissions; never silently underestimate a paid call.
            if ($charged > $row->reserved_micro_usd) DB::table('assistant_controls')->where('id', 1)->update(['tripped' => true]);
            $units = app(Tokens::class)->settle($row, $actual);
            DB::table('assistant_requests')->where('id', $id)->update(['state' => $actual === null ? 'uncertain' : 'complete',
                'charged_micro_usd' => $charged, 'charged_units' => $units, 'finished_at' => now()]);
        }, 5);
    }

    public function ready(): bool
    {
        return (bool) config('assistant.enabled') && (string) config('services.openai.key') !== ''
            && DB::table('assistant_controls')->where('id', 1)->where('tripped', false)->exists();
    }

    private function limits(int $user): array
    {
        $now = now()->utc(); $month = $now->format('Ym'); $day = $now->format('Ymd');
        return [
            'month:'.$month => [max(0, config('assistant.month_micro_usd')), PHP_INT_MAX],
            "user:$user:day:$day" => [PHP_INT_MAX, max(0, config('assistant.user_day_calls'))],
            "user:$user:minute:".$now->format('YmdHi') => [PHP_INT_MAX, max(0, config('assistant.user_minute_calls'))],
        ];
    }
}
