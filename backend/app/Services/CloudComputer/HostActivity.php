<?php
namespace App\Services\CloudComputer;

use Illuminate\Support\Facades\DB;

/** What the VM Host reports every 15 s, and what happens when the computer sleeps. */
class HostActivity
{
    public function record(object $w, array $d): void
    {
        $running = max(0, min(50, (int) $d['running'])); $waiting = max(0, min(50, (int) $d['waitingApproval']));
        $login = $d['login'] ?? [];
        $update = ['host_running' => $running, 'host_waiting' => $waiting, 'host_activity_at' => now(),
            'login_claude' => isset($login['claude']) ? (bool) $login['claude'] : null,
            'login_codex' => isset($login['codex']) ? (bool) $login['codex'] : null];
        if ($running + $waiting > 0) $update['last_activity_at'] = now();
        DB::table('cloud_workspaces')->where('id', $w->id)->where('generation', $w->generation)->update($update);
        if (array_key_exists('projects', $d)) app(Projects::class)->report($w, (array) $d['projects']);
    }

    /** Called when the machine is confirmed stopped (account wallet lock held). */
    public function slept(object $w): void
    {
        if (($w->kind ?? 'project') !== 'computer') return;
        DB::table('cloud_workspaces')->where('id', $w->id)->update(['host_running' => 0, 'host_waiting' => 0, 'host_activity_at' => null]);
        if ($w->remote_host_id) DB::table('remote_hosts')->where('id', $w->remote_host_id)->update(['online_until' => null, 'last_seen_at' => now()]);
    }
}
