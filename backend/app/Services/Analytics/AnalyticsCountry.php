<?php

namespace App\Services\Analytics;

use GeoIp2\Database\Reader;
use Illuminate\Http\Request;
use Throwable;

class AnalyticsCountry
{
    public function fromRequest(Request $request): ?string
    {
        $ip = (string) $request->ip();
        if (! filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            return null;
        }
        $path = (string) config('services.maxmind.database_path');
        if ($path === '' || ! is_file($path)) return null;
        $reader = null;
        try {
            $reader = new Reader($path);
            $country = strtoupper((string) ($reader->city($ip)->country->isoCode ?? ''));
            return preg_match('/^[A-Z]{2}$/D', $country) ? $country : null;
        } catch (Throwable) {
            return null;
        } finally {
            $reader?->close();
        }
    }
}
