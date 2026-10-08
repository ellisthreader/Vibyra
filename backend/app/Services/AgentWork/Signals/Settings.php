<?php
namespace App\Services\AgentWork\Signals;
use App\Services\AgentRuns\ApiError;
use App\Services\Notifications\Preferences;
use Illuminate\Support\Facades\DB;
final class Settings
{
    public static function enabled(): bool { return (bool) config('agents_v2.work_enabled'); }
    public function preferences(int $user): array
    {
        $p = app(Preferences::class)->get($user);
        return ['revision'=>(int)$p->revision,'mode'=>$p->agent_mode,'timezone'=>$p->timezone,
            'quietStart'=>$p->quiet_start,'quietEnd'=>$p->quiet_end,'digestMinute'=>(int)$p->agent_digest_minute];
    }
    public function save(int $user, array $d): array
    {
        return DB::transaction(function () use ($user,$d) {
            app(Preferences::class)->get($user);
            $p=DB::table('notification_preferences')->where('user_id',$user)->lockForUpdate()->first();
            self::revision($p->revision,$d['expectedRevision']);
            abort_unless(($d['quietStart']===null)===($d['quietEnd']===null),422,'Choose both quiet-hour boundaries.');
            DB::table('notification_preferences')->where('user_id',$user)->update(['revision'=>$p->revision+1,
                'agent_mode'=>$d['mode'],'agent_digest_minute'=>$d['digestMinute'],'timezone'=>$d['timezone'],
                'quiet_start'=>$d['quietStart'],'quiet_end'=>$d['quietEnd']]);
            if ($p->agent_mode!==$d['mode']) DB::table('agent_signal_digest_items')->where('user_id',$user)
                ->whereNull('digest_id')->whereNull('discarded_at')->update(['discarded_at'=>now()]);
            return $this->preferences($user);
        });
    }
    public static function revision(int $actual,int $expected): void
    {
        if ($actual!==$expected) ApiError::throw(409,'signals_changed','These settings changed. Refresh before saving.');
    }
}
