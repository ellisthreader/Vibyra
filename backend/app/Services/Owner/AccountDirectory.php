<?php

namespace App\Services\Owner;

use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

final class AccountDirectory
{
    public function query(): Builder
    {
        $usage = DB::table('vibyra_sessions')->select('user_id')
            ->selectRaw('MAX(last_used_at) as last_session_used_at')
            ->selectRaw('SUM(CASE WHEN revoked_at IS NULL AND last_used_at >= ? THEN 1 ELSE 0 END) as recent_sessions_5m', [now()->subMinutes(5)])
            ->groupBy('user_id');
        $logins = DB::table('auth_login_events')->select('user_id')
            ->selectRaw('MAX(created_at) as last_login_at')
            ->selectRaw('SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as logins_30d', [now()->subDays(30)])
            ->groupBy('user_id');
        return DB::table('users')->leftJoinSub($usage, 'usage', fn ($join) => $join->on('usage.user_id', '=', 'users.id'))
            ->leftJoinSub($logins, 'logins', fn ($join) => $join->on('logins.user_id', '=', 'users.id'))
            ->select('users.id', 'users.name', 'users.email', 'users.plan', 'users.guest_at',
                'users.created_at', 'users.email_verified_at', 'users.owner_banned_at', 'users.owner_action_revision',
                'usage.last_session_used_at', 'usage.recent_sessions_5m', 'logins.last_login_at', 'logins.logins_30d');
    }

    public function search(array $input): array
    {
        $query = $this->query();
        $search = trim($input['search'] ?? '');
        if (ctype_digit($search) && strlen($search) < 19) {
            $query->where('users.id', (int) $search);
        } elseif ($search !== '') {
            $literal = '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], mb_strtolower($search)).'%';
            $query->where(function ($match) use ($literal, $search) {
                $match->whereRaw("LOWER(users.name) LIKE ? ESCAPE '!'", [$literal])
                    ->orWhereRaw("LOWER(users.email) LIKE ? ESCAPE '!'", [$literal]);
            });
        }
        if (($input['status'] ?? '') === 'banned') $query->whereNotNull('users.owner_banned_at');
        if (($input['status'] ?? '') === 'active') $query->whereNull('users.owner_banned_at');
        $accounts = $query->orderByDesc('users.created_at')->orderByDesc('users.id')
            ->paginate(25, ['*'], 'page', (int) ($input['page'] ?? 1));
        return ['ok' => true, 'accounts' => $accounts->items(), 'page' => $accounts->currentPage(),
            'per_page' => $accounts->perPage(), 'total' => $accounts->total(), 'last_page' => $accounts->lastPage()];
    }
}
