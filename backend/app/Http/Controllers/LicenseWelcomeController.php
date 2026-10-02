<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UserPayloads;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class LicenseWelcomeController extends Controller
{
    use UserPayloads;

    public function __invoke(Request $request)
    {
        $user = $this->authenticatedUser($request);
        abort_unless(!$user->isGuest() && $user->hasVerifiedEmail(), 403, 'Verify your account first.');
        $input = $request->validate(['welcomeId' => 'required|uuid']);
        DB::transaction(function () use ($user, $input) {
            $license = DB::table('membership_licenses')->where('id', $input['welcomeId'])
                ->where('user_id', $user->id)->where('beta_welcome', true)
                ->whereNotNull('redeemed_at')->whereNull('revoked_at')->where('ends_at', '>', now())
                ->lockForUpdate()->first();
            abort_unless($license, 404, 'This welcome is unavailable.');
            if (!$license->beta_welcome_seen_at) {
                DB::table('membership_licenses')->where('id', $license->id)
                    ->update(['beta_welcome_seen_at' => now()]);
            }
        });
        // Do not refresh membership or allowance here. This only acknowledges presentation.
        return response()->json(['ok' => true])->header('Cache-Control', 'private, no-store');
    }
}
