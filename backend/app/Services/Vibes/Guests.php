<?php

namespace App\Services\Vibes;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Trying Vibes before there is an account, and keeping what is left of them when
 * one is made.
 *
 * A guest is an ordinary `users` row with `guest_at` set. Signing up converts that
 * row in place, so the wallet, its grants, its ledger and its chats never move.
 * That is what makes the rule hold without any reconciliation: spend every Vibe as
 * a guest, sign up, and the balance is still nothing, because it is the same
 * account it always was. The welcome grant is keyed `welcome:{user_id}` and
 * `Wallet::grant` ignores a reference it has already written, so signing up cannot
 * mint a second one even if something calls `ensure` again.
 *
 * How many Vibes a guest starts with is decided by Apple's DeviceCheck bit0, which
 * outlives deleting the app. A device that has had its trial gets a guest wallet
 * with nothing in it rather than no guest wallet at all: the app still works, the
 * balance simply reads zero, and there is nothing to gain by reinstalling.
 */
class Guests
{
    public function __construct(private Wallet $wallet, private DeviceCheck $devices) {}

    /**
     * A new guest account. `$deviceToken` is Apple's, from `DCDevice`; `$installId`
     * is the app's own and is only ever a hint, because it resets with the app.
     */
    public function issue(?string $deviceToken, string $installId): User
    {
        $hash = hash('sha256', $installId);
        $seen = $installId !== '' && DB::table('vibes_guest_installs')->where('hash', $hash)->exists();
        // Apple is asked only when this install is not already known to have had a
        // grant, so a reinstall loop costs us one round trip rather than two.
        $spent = $seen || ($deviceToken !== null && $this->devices->alreadyGranted($deviceToken));
        $credits = $spent ? 0 : Wallet::trialCredits();

        $user = DB::transaction(function () use ($credits, $hash, $installId) {
            $id = (string) Str::uuid();
            $user = User::create([
                'name' => 'Guest', 'email' => 'guest-'.$id.'@guests.vibyra.invalid',
                // RFC 2606 reserves `.invalid`, so a guest address can never be
                // delivered to, and it can never be verified either.
                'provider' => 'guest', 'provider_id' => $id, 'password' => Str::random(64),
                'guest_at' => now(), 'plan' => 'free', 'plan_billing_cycle' => 'monthly',
                'credits_balance' => 0, 'credits_used' => 0, 'onboarding_complete' => false,
                'remembered_desktops' => [], 'app_state' => [],
            ]);
            // The wallet is created with the amount decided above, under the same
            // `welcome:` reference an account would use, which is what stops a
            // second grant appearing when this row is later signed up.
            $this->wallet->ensure($user, $credits);
            if ($installId !== '') {
                DB::table('vibes_guest_installs')->updateOrInsert(['hash' => $hash],
                    ['user_id' => $user->id, 'granted_at' => now(), 'created_at' => now()]);
            }
            return $user;
        }, 3);

        // Told to Apple after the grant is committed. The other order can lose the
        // bit on a failed transaction and hand the same device a second trial.
        if ($credits > 0 && $deviceToken !== null) $this->devices->markGranted($deviceToken);
        return $user;
    }

    /**
     * Turn a guest into the account being signed up, under the row's own lock.
     *
     * Everything it owns comes with it because nothing is copied. The checks are
     * the ones that stop this being a way to collect balances: the row must still
     * be an unclaimed guest, and the address must still be free at the moment the
     * write happens rather than at the moment the request was validated.
     */
    public function claim(User $guest, string $email, string $password, string $name): User
    {
        return DB::transaction(function () use ($guest, $email, $password, $name) {
            $locked = User::whereKey($guest->id)->lockForUpdate()->firstOrFail();
            abort_if($locked->guest_at === null, 409, 'This guest has already been signed up.');
            abort_if(User::where('email', $email)->whereKeyNot($locked->id)->exists(), 409,
                'An account already exists for that email. Log in instead.');
            $locked->forceFill([
                'name' => $name !== '' ? $name : Str::before($email, '@'),
                'email' => $email, 'provider' => 'email', 'provider_id' => $email,
                'password' => $password, 'guest_at' => null,
                'credits_balance' => (int) (config('billing.plans.free.monthly_credits') ?? 50),
                'plan_renews_at' => now()->addMonth(),
            ])->save();
            $this->wallet->record($locked->id, 'guest-claim:'.$locked->id, 'claim', 0,
                ['balance' => $this->wallet->payload($locked->id)['available']]);
            return $locked->fresh() ?? $locked;
        }, 3);
    }
}
