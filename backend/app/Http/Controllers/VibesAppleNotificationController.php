<?php

namespace App\Http\Controllers;

use App\Services\Vibes\{AppleStore, Purchases};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class VibesAppleNotificationController extends Controller
{
    public function __invoke(Request $request, AppleStore $apple, Purchases $purchases)
    {
        $data = $request->validate(['signedPayload' => 'required|string|max:50000']);
        // Untrusted notification content is only a lookup hint. All billing values are
        // independently retrieved from Apple's authenticated server API before mutation.
        $notification = $this->hint($data['signedPayload']);
        $hint = $this->hint($notification['data']['signedTransactionInfo'] ?? '');
        $id = $hint['transactionId'] ?? null;
        if (!is_string($id) || !preg_match('/^[0-9]{1,40}$/', $id)) return response()->json(['ok' => true]);
        $t = $apple->transaction($id);
        $wallet = DB::table('vibes_wallets')->where('account_token', strtolower($t['appAccountToken'] ?? ''))->first();
        if ($wallet) $purchases->apply($wallet->user_id, $t);
        return response()->json(['ok' => true]);
    }

    private function hint(string $value): array
    {
        $parts = explode('.', $value);
        if (count($parts) !== 3) return [];
        $decoded = base64_decode(strtr($parts[1], '-_', '+/'), true);
        $data = $decoded ? json_decode($decoded, true) : null;
        return is_array($data) ? $data : [];
    }
}
