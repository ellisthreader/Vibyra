<?php

namespace App\Services\Analytics;

use GeoIp2\Database\Reader;
use Illuminate\Http\Request;
use Throwable;

class AnalyticsCountry
{
    public function fromRequest(Request $request): ?string
    {
        return $this->locationFromRequest($request)['country_code'];
    }

    public function locationFromRequest(Request $request): array
    {
        $ip = (string) $request->ip();
        if (! filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            return ['country_code' => null, 'region_code' => null];
        }
        $path = (string) config('services.maxmind.database_path');
        if ($path === '' || ! is_file($path)) return ['country_code' => null, 'region_code' => null];
        $reader = null;
        try {
            $reader = new Reader($path);
            $city = $reader->city($ip);
            $country = strtoupper((string) ($city->country->isoCode ?? ''));
            $region = strtoupper((string) ($city->mostSpecificSubdivision->isoCode ?? ''));
            return [
                'country_code' => preg_match('/^[A-Z]{2}$/D', $country) ? $country : null,
                'region_code' => preg_match('/^[A-Z0-9-]{1,12}$/D', $region) ? $region : null,
            ];
        } catch (Throwable) {
            return ['country_code' => null, 'region_code' => null];
        } finally {
            $reader?->close();
        }
    }
}
