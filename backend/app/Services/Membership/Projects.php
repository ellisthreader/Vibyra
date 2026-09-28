<?php

namespace App\Services\Membership;

use App\Services\Vibes\Wallet;
use Illuminate\Support\Facades\DB;

/** Free keeps one active linked project; dormant conversations and files survive. */
final class Projects
{
    public function activate(int $userId, string $hostId, string $projectId): void
    {
        if (!Units::modern($userId)) return;
        DB::table('vibes_wallets')->where('user_id', $userId)->update(['active_project_key' => $hostId.'/'.$projectId]);
    }
    public function guard(int $userId, object $chat): void
    {
        if (!Units::modern($userId) || !$chat->project_id || app(Wallet::class)->planFor($userId) !== 'free') return;
        $key = $chat->host_id.'/'.$chat->project_id;
        $active = DB::table('vibes_wallets')->where('user_id', $userId)->value('active_project_key');
        if (!$active) { $this->activate($userId, $chat->host_id, $chat->project_id); return; }
        abort_unless($active === $key, 402, 'Free includes one active linked AI project. Select this project in Use a project to switch. Your other conversations and files are kept.');
    }
}
