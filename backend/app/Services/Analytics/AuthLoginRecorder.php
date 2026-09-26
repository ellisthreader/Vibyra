<?php

namespace App\Services\Analytics;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Throwable;

class AuthLoginRecorder
{
    /** Records a completed authentication, not an app open or a token refresh. */
    public function record(User $user, string $channel, string $method): void
    {
        if (! in_array($channel, ['website', 'app', 'desktop'], true)
            || ! in_array($method, ['password', 'totp', 'apple', 'google'], true)) {
            return;
        }
        try {
            DB::table('auth_login_events')->insert([
                'user_id' => $user->id,
                'channel' => $channel,
                'method' => $method,
                'created_at' => now(),
            ]);
        } catch (Throwable $error) {
            report($error);
        }
    }
}
