<?php

namespace App\Http\Controllers\Concerns;

use App\Models\MembershipCancellationFeedback;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Throwable;

trait BillingCancellationActions
{
    public function cancelMembership(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $reason = strtolower(trim((string) $request->input('reason')));
        $details = trim((string) $request->input('details', ''));
        $allowed = ['too_expensive', 'not_using_enough', 'missing_features', 'technical_issues', 'switching_service', 'temporary_break', 'other'];
        if (! in_array($reason, $allowed, true)) {
            return $this->json(['ok' => false, 'error' => 'Choose why you are cancelling.'], 422);
        }
        if ($request->boolean('confirmed') !== true) {
            return $this->json(['ok' => false, 'error' => 'Confirm that you want to cancel membership.'], 422);
        }
        if ($reason === 'other' && $details === '') {
            return $this->json(['ok' => false, 'error' => 'Tell us why you are cancelling.'], 422);
        }
        if (mb_strlen($details) > 1000) {
            return $this->json(['ok' => false, 'error' => 'Feedback must be 1,000 characters or fewer.'], 422);
        }
        if (($user->plan ?: 'free') === 'free') {
            return $this->json(['ok' => false, 'error' => 'This account does not have a paid membership.'], 422);
        }

        $provider = strtolower((string) ($user->billing_provider ?? ''));
        $feedback = MembershipCancellationFeedback::create([
            'user_id' => $user->id,
            'plan' => $user->plan,
            'billing_cycle' => $user->plan_billing_cycle ?: 'monthly',
            'billing_provider' => $provider ?: null,
            'reason' => $reason,
            'details' => $details ?: null,
            'status' => $provider === 'manual' ? 'scheduling' : 'provider_action_required',
            'confirmed_at' => now(),
            'metadata' => ['surface' => 'desktop_settings'],
        ]);

        if ($provider === 'manual') {
            return $this->scheduleManualCancellation($user, $feedback);
        }

        [$url, $error, $status] = $this->cancellationDestination($provider, $user);
        if ($error) {
            $feedback->forceFill(['status' => 'provider_unavailable'])->save();
            return $this->json(['ok' => false, 'error' => $error, 'feedbackId' => $feedback->id], $status);
        }
        return $this->json([
            'ok' => true,
            'feedbackId' => $feedback->id,
            'status' => 'provider_action_required',
            'url' => $url,
        ]);
    }

    private function scheduleManualCancellation($user, MembershipCancellationFeedback $feedback): JsonResponse
    {
        $endsAt = $user->membership_ends_at
            ?: ($user->plan_billing_cycle === 'annual' ? now()->addYear() : now()->addMonth());
        DB::transaction(function () use ($user, $feedback) {
            $user->forceFill([
                'membership_cancel_at_period_end' => true,
                'membership_ends_at' => $user->membership_ends_at
                    ?: ($user->plan_billing_cycle === 'annual' ? now()->addYear() : now()->addMonth()),
            ])->save();
            $feedback->forceFill([
                'status' => 'scheduled',
                'metadata' => array_merge($feedback->metadata ?: [], [
                    'effective_at' => optional($user->membership_ends_at)->toIso8601String(),
                ]),
            ])->save();
        });

        return $this->json([
            'ok' => true,
            'feedbackId' => $feedback->id,
            'status' => 'scheduled',
            'effectiveAt' => $endsAt->toIso8601String(),
            'user' => $this->userPayload($user->fresh()),
        ]);
    }

    private function cancellationDestination(string $provider, $user): array
    {
        if ($provider === 'iap-apple') {
            return ['https://apps.apple.com/account/subscriptions', null, 200];
        }
        if ($provider === 'iap-google') {
            return ['https://play.google.com/store/account/subscriptions', null, 200];
        }
        if ($provider !== 'stripe') {
            return [null, 'No cancellation portal is attached to this membership. Contact Vibyra support.', 422];
        }
        $stripe = $this->stripe();
        if (! $stripe) {
            return [null, 'Stripe is not configured on the backend.', 503];
        }
        if (! $user->stripe_customer_id) {
            return [null, 'No Stripe customer is attached to this membership.', 422];
        }
        try {
            $session = $stripe->billingPortal->sessions->create([
                'customer' => $user->stripe_customer_id,
                'return_url' => (string) config('services.stripe.portal_return_url'),
            ]);
            return [$session->url, null, 200];
        } catch (Throwable) {
            return [null, 'Could not open the secure cancellation portal.', 502];
        }
    }

    private function completeProviderCancellationFeedback($user): void
    {
        MembershipCancellationFeedback::where('user_id', $user->id)
            ->where('billing_provider', 'stripe')
            ->where('status', 'provider_action_required')
            ->latest('id')
            ->first()
            ?->forceFill(['status' => 'completed', 'completed_at' => now()])
            ->save();
    }
}
