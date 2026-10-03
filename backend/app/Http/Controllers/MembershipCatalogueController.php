<?php

namespace App\Http\Controllers;

use App\Services\Membership\Offers;

final class MembershipCatalogueController extends Controller
{
    public function __invoke()
    {
        return response()->json(['version' => 2, 'offers' => app(Offers::class)->all(),
            'freePilotEnabled' => (bool) config('membership.enabled') && (bool) config('membership.free_enabled'),
            'free' => ['tokens' => config('membership.free_tokens'), 'interval' => 'month',
                'eligibility' => 'Limited pilot for verified accounts; availability is shown after sign-in.'],
            'currency' => 'GBP', 'vatInclusive' => true]);
    }
}
