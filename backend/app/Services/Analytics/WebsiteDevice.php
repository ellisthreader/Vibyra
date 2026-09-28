<?php

namespace App\Services\Analytics;

use Illuminate\Http\Request;

class WebsiteDevice
{
    public function fromRequest(Request $request): array
    {
        $agent = strtolower((string) $request->userAgent());
        $device = match (true) {
            str_contains($agent, 'bot'), str_contains($agent, 'crawler'), str_contains($agent, 'spider') => 'bot',
            str_contains($agent, 'ipad'), str_contains($agent, 'tablet') => 'tablet',
            str_contains($agent, 'mobile'), str_contains($agent, 'iphone'), str_contains($agent, 'android') => 'mobile',
            $agent === '' => 'unknown',
            default => 'desktop',
        };
        $browser = match (true) {
            str_contains($agent, 'edg/') => 'edge',
            str_contains($agent, 'firefox/') => 'firefox',
            str_contains($agent, 'chrome/') || str_contains($agent, 'crios/') => 'chrome',
            str_contains($agent, 'safari/') => 'safari',
            default => 'other',
        };
        return ['device_type' => $device, 'browser_family' => $browser];
    }
}
