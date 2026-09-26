<?php

namespace App\Http\Controllers;

use App\Http\Middleware\LocalOwnerAccess;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

class LocalOwnerLoginController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        abort_unless(LocalOwnerAccess::available($request), 404);

        $user = User::firstOrNew(['email' => LocalOwnerAccess::EMAIL]);
        $user->fill([
            'name' => 'Local owner',
            'provider' => 'local_owner',
            'provider_id' => LocalOwnerAccess::EMAIL,
            'password' => Str::random(64),
            'email_verified_at' => now(),
        ]);
        $user->save();

        Auth::guard('web')->login($user);
        $request->session()->regenerate();

        return response()->json(['ok' => true, 'next' => '/owner'])
            ->header('Cache-Control', 'private, no-store');
    }
}
