<?php

namespace App\Services\Analytics;

use GeoIp2\Database\Reader;
use Throwable;

class CountryResolver
{
    private ?Reader $reader = null;

    public function forIp(?string $ip): ?string
    {
        if (! $ip || ! filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            return null;
        }
        $path = (string) config('services.maxmind.database_path');
        if ($path === '' || ! is_file($path)) {
            return null;
        }

        try {
            $this->reader ??= new Reader($path);
            $code = strtoupper((string) $this->reader->country($ip)->country->isoCode);

            return preg_match('/^[A-Z]{2}$/D', $code) ? $code : null;
        } catch (Throwable) {
            return null;
        }
    }
}
