<?php

namespace App\Http\Controllers;

use App\Services\Analytics\Recorder;
use App\Models\PhoneWaitlistSignup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PhoneWaitlistController extends Controller
{
    /**
     * Collects interest in the phone companion from the homepage.
     *
     * A repeat address gets the same answer as a fresh one, so the endpoint
     * never reveals who is already on the list.
     */
    public function store(Request $request): JsonResponse
    {
        app(Recorder::class)->consented($request, 'website_waitlist_attempted');
        $email = strtolower(trim((string) $request->input('email', '')));

        if (! filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 255) {
            return response()->json([
                'ok' => false,
                'error' => 'Enter an email address we can reach you at.',
            ], 422);
        }

        $signup = PhoneWaitlistSignup::firstOrCreate(
            ['email' => $email],
            ['source' => PhoneWaitlistSignup::SOURCE_MARKETING_HOME],
        );
        if ($signup->wasRecentlyCreated) {
            app(Recorder::class)->operational('website_waitlist_signup');
            app(Recorder::class)->consented($request, 'website_waitlist_completed');
        }

        return response()->json(['ok' => true]);
    }
}
