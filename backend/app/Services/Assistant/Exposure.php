<?php
namespace App\Services\Assistant;

use Illuminate\Support\Facades\DB;

/** Called under the singleton control lock: settlement and admission cannot race this total. */
final class Exposure
{
    public function admit(int $cost): void
    {
        $month = now()->utc()->startOfMonth()->toDateTimeString();
        $exposure = DB::table('assistant_requests')->where(function ($query) use ($month) {
            $query->where('state', 'reserved')->orWhere(function ($uncertain) use ($month) {
                $uncertain->where('state', 'uncertain')->where('created_at', '>=', $month);
            });
        })->sum(DB::raw("CASE WHEN state = 'reserved' THEN reserved_micro_usd ELSE COALESCE(charged_micro_usd, reserved_micro_usd) END"));
        $limit = max(0, (int) config('assistant.uncertain_month_micro_usd'));
        if ($cost > $limit || $exposure > $limit - $cost) {
            Failure::raise(503, 'assistant_capacity', 'Vibyra AI is at capacity. Your tokens remain available; please try again later.');
        }
    }
}
