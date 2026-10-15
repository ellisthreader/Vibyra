<?php
namespace App\Services\LiveActivities;

use Illuminate\Support\Facades\DB;

/** Two switches per account: whether to use Live Activities, and whether the card may show details. */
final class Preferences
{
    public function get(int $user): array
    {
        $row = DB::table('live_activity_preferences')->where('user_id', $user)->first();
        return ['enabled' => $row ? (bool) $row->enabled : true, 'details' => $row ? (bool) $row->details : false,
            'revision' => $row ? (int) $row->revision : 0];
    }

    public function save(int $user, array $data): array
    {
        $current = $this->get($user);
        $next = ['enabled' => $data['enabled'] ?? $current['enabled'], 'details' => $data['details'] ?? $current['details']];
        DB::table('live_activity_preferences')->updateOrInsert(['user_id' => $user], [
            'enabled' => $next['enabled'], 'details' => $next['details'], 'revision' => $current['revision'] + 1,
            'created_at' => now(), 'updated_at' => now()]);
        return $this->get($user);
    }
}
