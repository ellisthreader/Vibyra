<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UserPayloads;
use App\Services\Spend\{Settings, SpendCaps};
use App\Services\Vibes\Wallet;
use Illuminate\Http\Request;

/** A person's own spend limits. Reports `enabled: false` (and refuses writes) until SPEND_CAPS_ENABLED. */
final class SpendCapsController extends Controller
{
    use UserPayloads;

    private function account(Request $request): int
    {
        $user = $this->authenticatedUser($request, allowGuest: true);
        app(Wallet::class)->ensure($user);
        return $user->id;
    }

    public function show(Request $request, Settings $settings)
    {
        return $this->json(['spendCaps' => $settings->payload($this->account($request))]);
    }

    public function update(Request $request, Settings $settings)
    {
        abort_unless(SpendCaps::enabled(), 404);
        $max = (int) config('spend_caps.max_tokens');
        $data = $request->validate([
            'day' => "sometimes|nullable|numeric|min:1|max:$max", 'month' => "sometimes|nullable|numeric|min:1|max:$max",
            'run' => "sometimes|nullable|numeric|min:1|max:$max", 'alerts' => 'sometimes|boolean',
            'cloudIncludedHours' => 'sometimes|nullable|in:tokens,stop', 'timezone' => 'sometimes|timezone',
        ]);
        return $this->json(['spendCaps' => $settings->save($this->account($request), $data)]);
    }

    public function raise(Request $request, Settings $settings)
    {
        abort_unless(SpendCaps::enabled(), 404);
        $data = $request->validate(['cap' => 'required|in:day,month', 'tokens' => 'sometimes|nullable|numeric|min:1|max:'.(int) config('spend_caps.max_tokens')]);
        return $this->json(['spendCaps' => $settings->raise($this->account($request), $data['cap'], isset($data['tokens']) ? (float) $data['tokens'] : null)]);
    }
}
