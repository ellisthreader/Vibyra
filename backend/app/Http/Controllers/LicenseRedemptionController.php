<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UserPayloads;
use App\Services\Membership\Licenses\Redemption;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\{DB, RateLimiter};

final class LicenseRedemptionController extends Controller
{
    use UserPayloads;

    public function __invoke(Request $r, Redemption $redemption)
    {
        $user = $r->is('web-api/*') ? ($r->user('web') ?? abort(401)) : $this->authenticatedUser($r);
        if ($r->is('web-api/*')) {
            $scope = $r->validate(['expectedAccountId' => 'required|integer|min:1']);
            abort_unless((string) $scope['expectedAccountId'] === (string) $user->id, 409, 'Your account changed. Refresh before redeeming your key.');
        }
        $key = 'license-redemption:'.$user->id;
        abort_if(RateLimiter::tooManyAttempts($key, 5), 429, 'Please wait before trying another key.');
        RateLimiter::hit($key, 60);
        $result = $redemption->redeem($user, $r->attributes->get('license_hash', ''));
        DB::table('membership_license_claims')->where('user_id', $user->id)->delete();
        return response()->json(['ok' => true, ...$result, 'user' => $this->userPayload($user->fresh())])
            ->header('Cache-Control', 'private, no-store');
    }
}
