<?php

namespace App\Services\Analytics;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

class Recorder
{
    /** Website traffic never stores IP addresses, user agents, or raw session IDs. */
    public function website(Request $request, string $event, ?string $dimension = null): void
    {
        if ($request->method() !== 'GET') {
            return;
        }
        try {
            if ($event === 'website_download') {
                $this->operational($event, $dimension);
                $this->consented($request, 'website_download_completed', $dimension);
                return;
            }
            app(WebsiteEvents::class)->record($request, app(WebsiteConsent::class), $event, $dimension);
        } catch (Throwable $error) {
            report($error);
        }
    }

    public function signup(Request $request): void
    {
        $this->operational('website_signup');
        $this->consented($request, 'website_signup_completed');
    }

    public function operational(string $event, ?string $dimension = null): void
    {
        try {
            DB::table('analytics_events')->insert([
                'event_id' => (string) Str::uuid(),
                'user_id' => null,
                'surface' => 'website',
                'event' => $event,
                'dimension' => $dimension,
                'platform' => $event === 'website_download' ? $dimension : null,
                'visitor_hash' => null,
                'properties' => null,
                'occurred_at' => now(),
                'created_at' => now(),
            ]);
        } catch (Throwable $error) {
            report($error);
        }
    }

    public function consented(Request $request, string $event, ?string $dimension = null): void
    {
        try {
            app(WebsiteEvents::class)->record($request, app(WebsiteConsent::class), $event, $dimension);
        } catch (Throwable $error) {
            report($error);
        }
    }
}
