<?php
namespace App\Services\CloudComputer\Owners;

use App\Services\CloudComputer\{AccessProjects, Computers};
use Illuminate\Support\Facades\DB;

/** Current project authority shared by conversation ownership and Host activity. Host folder listings are not grants. */
final class OwnerProjects
{
    public function allowed(int $user, string $name, ?string $workspace = null): bool
    {
        // Removed sync names cannot borrow a native queue entry or a same-named tick.
        $row = DB::table('cloud_sync_projects')->where('user_id', $user)->where('name', $name)->first();
        if ($row) return !$row->removed_at && app(AccessProjects::class)->allowed($user, $row->project_key);
        $workspace ??= app(Computers::class)->find($user)?->id;
        if ($workspace && DB::table('cloud_computer_projects')->where('workspace_id', $workspace)->where('name', $name)
            ->whereIn('state', ['pending', 'done'])->exists()) return true;
        return DB::table('cloud_project_access')->where('user_id', $user)->where('name', $name)->where('allowed', true)->exists();
    }
}
