<?php

namespace App\Services\Analytics;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class WebsiteEvents
{
    public const ROUTES = ['/', '/downloads', '/benchmarks', '/login', '/signup',
        '/billing', '/checkout', '/billing/success', '/billing/cancel', '/account',
        '/account/downloads', '/legal/privacy', '/legal/terms'];
    public const CTA_IDS = ['nav_downloads', 'nav_login', 'home_get_vibyra',
        'home_login', 'downloads_windows', 'downloads_linux', 'downloads_linux_deb',
        'downloads_macos_arm64', 'downloads_macos_x64', 'signup_submit',
        'pricing_opened', 'faq_opened', 'hero_download', 'hero_walkthrough',
        'hero_film', 'plans_buy', 'plans_signup', 'mobile_waitlist',
        'getting_started_download', 'nav_mobile_download', 'faq_downloads',
        'billing_buy', 'billing_start_free', 'checkout_signup', 'checkout_login', 'checkout_pay'];
    public const PLATFORMS = ['windows', 'linux', 'linux-deb', 'macos-arm64', 'macos-x64'];
    public const FORMS = ['signup', 'waitlist', 'faq', 'billing'];
    public const CLIENT_EVENTS = ['website_page_view', 'website_cta_clicked',
        'website_download_clicked', 'website_engagement_interval', 'website_form_started',
        'website_form_submitted', 'website_performance', 'website_error'];
    public const METRICS = ['ttfb', 'lcp', 'inp', 'cls'];
    public const ERRORS = ['script', 'resource', 'promise', 'network'];

    public function record(Request $request, WebsiteConsent $consent, string $event,
        ?string $dimension, ?int $seconds = null, ?string $id = null, array $metadata = []): bool
    {
        if (! config('owner_analytics.ingestion_enabled', true)
            || ! $this->allowed($event, $dimension, $seconds, $metadata)) return false;
        $device = app(WebsiteDevice::class)->fromRequest($request);
        if ($device['device_type'] === 'bot') return false;
        $subject = $consent->subject($request);
        return DB::transaction(function () use ($request, $consent, $event, $dimension,
            $seconds, $subject, $id, $metadata, $device): bool {
            $current = $consent->current($request, true);
            if (! in_array($current['choice'], ['aggregate', 'linked'], true)) return false;
            $page = $event === 'website_page_view';
            $location = $page ? app(AnalyticsCountry::class)->locationFromRequest($request)
                : ['country_code' => null, 'region_code' => null];
            $acquisition = $page ? app(WebsiteAcquisition::class)->fromRequest($request, $metadata) : [];
            DB::table('analytics_events')->insertOrIgnore([
                'event_id' => $id ?? (string) Str::uuid(),
                'user_id' => $current['choice'] === 'linked' ? $request->user('web')?->id : null,
                'surface' => 'website', 'event' => $event, 'dimension' => $dimension,
                'platform' => in_array($event, ['website_download_clicked', 'website_download_requested',
                    'website_download_completed'], true)
                    ? $dimension : null,
                'visitor_hash' => $subject, 'consent_subject_hash' => $subject,
                'country_code' => $location['country_code'], 'region_code' => $location['region_code'],
                'acquisition_channel' => $acquisition['acquisition_channel'] ?? null,
                'source' => $acquisition['source'] ?? null, 'medium' => $acquisition['medium'] ?? null,
                'campaign' => $acquisition['campaign'] ?? null,
                'referrer_domain' => $acquisition['referrer_domain'] ?? null,
                'device_type' => $page ? $device['device_type'] : null,
                'browser_family' => $page ? $device['browser_family'] : null,
                'metric_name' => $event === 'website_performance' ? $metadata['metric_name'] : null,
                'metric_value' => $event === 'website_performance' ? $metadata['metric_value'] : null,
                'error_category' => $event === 'website_error' ? $metadata['error_category'] : null,
                'engaged_seconds' => $seconds, 'schema_version' => 2,
                'properties' => null, 'occurred_at' => now(), 'created_at' => now(),
            ]);
            return true;
        });
    }

    public function allowed(string $event, ?string $dimension, ?int $seconds,
        array $metadata = []): bool
    {
        if ($event === 'website_performance') {
            return in_array($dimension, self::ROUTES, true) && $seconds === null
                && in_array($metadata['metric_name'] ?? null, self::METRICS, true)
                && is_int($metadata['metric_value'] ?? null)
                && $metadata['metric_value'] >= 0 && $metadata['metric_value'] <= 120000;
        }
        if ($event === 'website_error') {
            return in_array($dimension, self::ROUTES, true) && $seconds === null
                && in_array($metadata['error_category'] ?? null, self::ERRORS, true);
        }
        if ($event === 'website_engagement_interval') {
            return in_array($dimension, self::ROUTES, true) && $seconds !== null
                && $seconds >= 1 && $seconds <= 30;
        }
        if ($seconds !== null) return false;
        return match ($event) {
            'website_page_view' => in_array($dimension, self::ROUTES, true),
            'website_cta_clicked' => in_array($dimension, self::CTA_IDS, true),
            'website_download_clicked', 'website_download_requested',
            'website_download_completed' => in_array($dimension, self::PLATFORMS, true),
            'website_form_started', 'website_form_submitted' => in_array($dimension, self::FORMS, true),
            'website_signup_attempted', 'website_signup_completed',
            'website_waitlist_attempted', 'website_waitlist_completed',
            'website_faq_answered' => $dimension === null,
            'website_checkout_started' => in_array($dimension, ['subscription', 'topup'], true),
            default => false,
        };
    }
}
