<?php
namespace App\Services\Notifications;
use Illuminate\Support\Facades\DB;
final class Preferences
{
    public function get(int $user): object
    {
        DB::table('notification_preferences')->insertOrIgnore(['user_id' => $user, 'activated_at' => now()]);
        return DB::table('notification_preferences')->where('user_id', $user)->first();
    }
    public function payload(int $user): array
    {
        $p = $this->get($user);
        return ['revision' => $p->revision, 'attention' => (bool) $p->attention, 'replies' => (bool) $p->replies,
            'smart' => (bool) $p->smart, 'advisories' => (bool) $p->advisories, 'timezone' => $p->timezone,
            'quietStart' => $p->quiet_start, 'quietEnd' => $p->quiet_end];
    }
    public function save(int $user, array $data): array
    {
        $this->get($user);
        $update = array_intersect_key($data, array_flip(['attention', 'replies', 'smart', 'advisories', 'timezone']));
        foreach (['quietStart' => 'quiet_start', 'quietEnd' => 'quiet_end'] as $key => $column) {
            if (array_key_exists($key, $data)) $update[$column] = $data[$key];
        }
        $update['revision'] = $data['revision'] + 1;
        abort_unless(DB::table('notification_preferences')->where('user_id', $user)->where('revision', $data['revision'])->update($update),
            409, 'Notification settings changed. Refresh before saving.');
        return $this->payload($user);
    }
    public function quiet(object $p): bool
    {
        if ($p->quiet_start === null || $p->quiet_end === null || $p->quiet_start === $p->quiet_end) return false;
        $time = now()->setTimezone($p->timezone); $minute = $time->hour * 60 + $time->minute;
        return $p->quiet_start < $p->quiet_end ? $minute >= $p->quiet_start && $minute < $p->quiet_end
            : $minute >= $p->quiet_start || $minute < $p->quiet_end;
    }
}
