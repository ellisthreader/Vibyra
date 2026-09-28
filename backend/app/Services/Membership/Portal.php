<?php

namespace App\Services\Membership;

use App\Models\User;

final class Portal
{
    public function parameters(User $user): array
    {
        $params = ['customer' => $user->stripe_customer_id,
            'return_url' => (string) config('services.stripe.portal_return_url')];
        if (Units::modern($user->id)) {
            $configuration = config('membership.stripe_portal_configuration');
            abort_unless($configuration, 503, 'Membership billing management is not configured.');
            $params['configuration'] = $configuration;
        }
        return $params;
    }
}
