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
            $this->reader ??= $this->open($path);
            $code = strtoupper($this->isoCode($this->reader, $ip));

            return preg_match('/^[A-Z]{2}$/D', $code) ? $code : null;
        } catch (Throwable) {
            return null;
        }
    }

    protected function open(string $path): Reader
    {
        return new Reader($path);
    }

    /**
     * `maxmind:update` installs GeoLite2-City, and the library only accepts `country()` on a Country
     * database: on the City file it throws, which this class turned into "unknown", so every request
     * was refused as outside a launch market. Ask the City database first; keep Country as the fallback.
     */
    private function isoCode(Reader $reader, string $ip): string
    {
        try {
            return (string) $reader->city($ip)->country->isoCode;
        } catch (\BadMethodCallException) {
            return (string) $reader->country($ip)->country->isoCode;
        }
    }
}
