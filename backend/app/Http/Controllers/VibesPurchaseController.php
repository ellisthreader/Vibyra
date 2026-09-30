<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UserPayloads;
use App\Services\Vibes\{AppleStore, Purchases, Wallet};
use Illuminate\Http\Request;

class VibesPurchaseController extends Controller
{
    use UserPayloads;

    public function claim(Request $request, AppleStore $apple, Purchases $purchases, Wallet $wallet)
    {
        $user = $this->authenticatedUser($request);
        $wallet->ensure($user);
        // Restore/settlement remains available when new purchases are disabled.
        $d = $request->validate(['transactionId' => 'required|string|regex:/^[0-9]{1,40}$/', 'productId' => 'required|string|max:160']);
        $t = $apple->transaction($d['transactionId']);
        abort_unless(($t['productId'] ?? null) === $d['productId'], 409, 'Apple verified a different product.');
        $purchases->apply($user->id, $t);
        return $this->json(['wallet' => $wallet->payload($user->id)]);
    }
}
