<?php

// Opt-in operator tool, never a public route. See docs/billing/stripe-sandbox-acceptance.md.
require __DIR__.'/stripe-sandbox/Safety.php';
require __DIR__.'/stripe-sandbox/Assertions.php';

use App\Models\User;
use App\Services\Membership\{Checkout, Entitlements, Portal, Units};
use App\Services\Vibes\Wallet;
use Illuminate\Support\Facades\{Artisan, Crypt, DB};
use Illuminate\Support\{Carbon, Str};
use Stripe\StripeClient;
use VibyraSandbox\{Assertions, Safety};

try {
    $root = Safety::check(getenv());
    require __DIR__.'/../vendor/autoload.php';
    $app = require __DIR__.'/../bootstrap/app.php';
    if ($app->configurationIsCached()) throw new RuntimeException('Refused: cached configuration.');
    $app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
    $effective = [
        'VIBYRA_STRIPE_SANDBOX' => getenv('VIBYRA_STRIPE_SANDBOX'), 'APP_ENV' => $app->environment(),
        'DB_CONNECTION' => config('database.default'), 'DB_DATABASE' => config('database.connections.sqlite.database'),
        'DB_URL' => config('database.connections.sqlite.url'), 'STRIPE_SECRET_KEY' => config('services.stripe.secret'),
        'STRIPE_SANDBOX_OPERATOR_KEY' => getenv('STRIPE_SANDBOX_OPERATOR_KEY'),
        'STRIPE_SANDBOX_CLAIMABLE' => getenv('STRIPE_SANDBOX_CLAIMABLE'),
        'MEMBERSHIP_STRIPE_ENVIRONMENT' => config('membership.stripe_environment'),
    ];
    if (Safety::check($effective) !== $root || config('cache.default') !== 'array'
        || config('queue.default') !== 'sync' || config('mail.default') !== 'array'
        || config('session.driver') !== 'array') throw new RuntimeException('Refused: isolation settings differ.');
    $runtime = new StripeClient(config('services.stripe.secret'));
    $operator = new StripeClient(getenv('STRIPE_SANDBOX_OPERATOR_KEY'));
    $action = $argv[1] ?? 'check';
    $name = $argv[2] ?? '';
    $path = $root.'/fixtures.json';
    $fixtures = is_file($path) ? json_decode(file_get_contents($path), true, flags: JSON_THROW_ON_ERROR) : [];
    $emit = fn ($data) => print(json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)."\n");
    if ($action === 'guard') { $emit(['isolated' => true]); exit(0); }
    if ($action === 'migrate') {
        if (Artisan::call('migrate', ['--force' => true]) !== 0) throw new RuntimeException('Disposable migration failed.');
        $emit(['migrated' => true]); exit(0);
    }
    if ($action === 'check') {
        foreach (config('membership.offers') as $offer) {
            $price = $operator->prices->retrieve($offer['stripe']);
            if ($price->livemode || !$price->active || $price->currency !== 'gbp' || $price->unit_amount !== $offer['pence']
                || (($price->recurring->interval ?? null) !== ($offer['interval'] ?? null))
                || ($price->recurring && $price->recurring->interval_count !== 1)) throw new RuntimeException('Price mismatch.');
        }
        $portal = $operator->billingPortal->configurations->retrieve(config('membership.stripe_portal_configuration'));
        $f = $portal->features;
        if ($portal->livemode || !$portal->active || !$f->subscription_cancel->enabled
            || $f->subscription_cancel->mode !== 'at_period_end' || $f->subscription_update->enabled
            || !$f->payment_method_update->enabled || !$f->invoice_history->enabled) throw new RuntimeException('Portal mismatch.');
        $emit(['sandboxPricesAndPortal' => true]); exit(0);
    }
    if ($action === 'seed') {
        $offerKey = $argv[3] ?? '';
        $offer = config('membership.offers.'.$offerKey);
        if (!$offer || !preg_match('/^[a-z0-9-]{1,48}$/D', $name)) throw new RuntimeException('Use seed FIXTURE OFFER_KEY.');
        if (!isset($fixtures[$name])) {
            $user = User::create(['name' => 'Sandbox acceptance', 'email' => Str::uuid().'@example.invalid',
                'email_verified_at' => now(), 'password' => password_hash(Str::random(40), PASSWORD_DEFAULT), 'plan' => 'free']);
            // No real identity, mail, free trial, or existing user is reused.
            DB::table('vibes_wallets')->insert(['user_id' => $user->id, 'billing_version' => 2,
                'account_token' => (string) Str::uuid(), 'created_at' => now(), 'updated_at' => now()]);
            $clock = null;
            if ($offer['kind'] === 'subscription' && getenv('STRIPE_SANDBOX_NO_CLOCKS') !== '1') {
                $clock = $operator->testHelpers->testClocks->create(['frozen_time' => time(), 'name' => 'Vibyra '.$name]);
                $customer = $operator->customers->create(['test_clock' => $clock->id, 'name' => 'Vibyra sandbox '.$name]);
                if ($customer->livemode) throw new RuntimeException('Unexpected live customer.');
                $user->forceFill(['stripe_customer_id' => $customer->id])->save();
            }
            $fixtures[$name] = ['user' => $user->id, 'offer' => $offerKey, 'order' => (string) Str::uuid(), 'clock' => $clock?->id];
            file_put_contents($path, json_encode($fixtures, JSON_PRETTY_PRINT), LOCK_EX); chmod($path, 0600);
        }
        $fixture = $fixtures[$name];
        if ($fixture['offer'] !== $offerKey) throw new RuntimeException('Fixture offer cannot change.');
        $url = app(Checkout::class)->create(User::findOrFail($fixture['user']), ['offerKey' => $offerKey,
            'offerVersion' => config('membership.version'), 'requestId' => $fixture['order']], $runtime);
        $emit(['fixture' => $name, 'checkout' => $url, 'clock' => $fixture['clock']]); exit(0);
    }
    if (!isset($fixtures[$name])) throw new RuntimeException('Unknown sandbox fixture.');
    $fixture = $fixtures[$name]; $user = User::findOrFail($fixture['user']);
    if (!str_ends_with($user->email, '@example.invalid') || !Units::modern($user->id)) throw new RuntimeException('Fixture ownership mismatch.');
    if ($action === 'portal') {
        $session = $runtime->billingPortal->sessions->create(app(Portal::class)->parameters($user));
        $emit(['portal' => $session->url]); exit(0);
    }
    if (!in_array($action, ['snapshot', 'assert'], true)) throw new RuntimeException('Unknown action.');
    // Stripe clocks do not advance PHP time: only this read-only observation uses clock time.
    if ($fixture['clock']) {
        $clock = $operator->testHelpers->testClocks->retrieve($fixture['clock']);
        if ($clock->status !== 'ready') throw new RuntimeException('Wait for the Stripe clock to be ready.');
        Carbon::setTestNow(Carbon::createFromTimestamp($clock->frozen_time));
    }
    $rows = DB::table('membership_periods')->where('user_id', $user->id)->orderBy('reference')->get();
    $refs = $rows->pluck('reference');
    $grants = DB::table('vibes_grants')->whereIn('reference', $refs)->get();
    $wonEvidence = $failureEvidence = false;
    foreach (DB::table('membership_events')->where('status', 'processed')
        ->whereIn('type', ['charge.dispute.closed', 'invoice.payment_failed'])->get(['payload']) as $event) {
        $payload = json_decode(Crypt::decryptString($event->payload), true, flags: JSON_THROW_ON_ERROR);
        if (($payload['livemode'] ?? null) !== false) continue;
        $object = $payload['data']['object'];
        $payment = $object['payment_intent'] ?? null;
        $subscription = $object['subscription'] ?? $object['parent']['subscription_details']['subscription'] ?? null;
        if ($payload['type'] === 'charge.dispute.closed' && ($object['status'] ?? null) === 'won'
            && is_string($payment) && str_starts_with($payment, 'pi_') && $rows->contains('payment_id', $payment)) $wonEvidence = true;
        if ($payload['type'] === 'invoice.payment_failed' && is_string($subscription)
            && str_starts_with($subscription, 'sub_') && $rows->contains('subscription_id', $subscription)) $failureEvidence = true;
    }
    $offer = config('membership.offers.'.$fixture['offer']);
    $snapshot = ['fixture' => $name, 'offer' => $fixture['offer'], 'subscription' => $offer['kind'] === 'subscription',
        'offerUnits' => $offer['credits'] * Units::SCALE, 'offerPence' => $offer['pence'], 'asOf' => now()->timestamp,
        'tier' => app(Entitlements::class)->for($user)['tier'], 'grantUnits' => (int) $grants->sum('amount'),
        'remainingUnits' => (int) $grants->sum('remaining'),
        'wonEvidence' => $wonEvidence,
        'failureEvidence' => $failureEvidence,
        'fundingBlocked' => $rows->contains(fn ($p) => $p->disputed || $p->refund_requested > $p->refunded_minor)
            || DB::table('membership_orders')->where('user_id', $user->id)->where('refund_pending', true)->exists(),
        'testOnly' => $rows->every(fn ($p) => $p->provider === 'stripe' && $p->environment === 'test'),
        'failedEvents' => DB::table('membership_events')->whereIn('status', ['pending', 'processing', 'failed'])->count(),
        'periods' => $rows->map(fn ($p) => ['reference' => $p->reference, 'subscriptionId' => $p->subscription_id,
            'paymentIntent' => $p->payment_id, 'endsAt' => $p->ends_at, 'cancelAtEnd' => (bool) $p->cancel_at_end,
            'refundedMinor' => (int) $p->refunded_minor, 'revokedUnits' => (int) $p->revoked_units,
            'disputed' => (bool) $p->disputed, 'revoked' => $p->revoked_at !== null])->all()];
    $passed = $action !== 'assert' || Assertions::verify($snapshot, $argv[3] ?? '');
    $emit(['passed' => $passed, ...$snapshot]); exit($passed ? 0 : 1);
} catch (Throwable $e) {
    // Never serialize provider requests, keys, customer details, or exception traces.
    $message = get_class($e) === RuntimeException::class
        ? $e->getMessage() : 'Sandbox operation failed; inspect the sandbox provider request log.';
    $error = ['message' => $message, 'type' => get_class($e)];
    if ($e instanceof \Stripe\Exception\ApiErrorException) $error += [
        'httpStatus' => $e->getHttpStatus(), 'code' => $e->getStripeCode(), 'param' => $e->getError()?->param];
    fwrite(STDERR, json_encode($error)."\n"); exit(1);
}
