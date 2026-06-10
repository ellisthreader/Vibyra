<?php

namespace App\Services;

use GeoIp2\Database\Reader;
use GeoIp2\Exception\AddressNotFoundException;
use Illuminate\Support\Facades\Cache;
use Throwable;

class SessionLocationResolver
{
    private ?Reader $reader = null;

    public function labelForIp(string $ip): string
    {
        $ip = trim($ip);
        if ($ip === '') {
            return 'Unknown location';
        }

        if (! filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            return 'Local network';
        }

        $cacheKey = "geoip.label.{$this->databaseVersion()}.{$ip}";
        $cached = Cache::get($cacheKey);
        if (is_string($cached) && $cached !== '') {
            return $cached;
        }

        $label = $this->lookupPublicIp($ip);
        if ($label !== $ip) {
            Cache::put($cacheKey, $label, now()->addDays(7));
        }

        return $label;
    }

    private function lookupPublicIp(string $ip): string
    {
        $reader = $this->reader();
        if (! $reader) {
            return $ip;
        }

        try {
            $record = $reader->city($ip);
        } catch (AddressNotFoundException) {
            return 'Unknown location';
        } catch (Throwable) {
            return $ip;
        }

        $city = trim((string) ($record->city->name ?? ''));
        $country = trim((string) ($record->country->name ?? ''));

        if ($city !== '' && $country !== '') {
            return "{$city}, {$country}";
        }

        return $country !== '' ? $country : 'Unknown location';
    }

    private function reader(): ?Reader
    {
        if ($this->reader) {
            return $this->reader;
        }

        $path = (string) config('services.maxmind.database_path');
        if ($path === '' || ! is_file($path)) {
            return null;
        }

        try {
            return $this->reader = new Reader($path);
        } catch (Throwable) {
            return null;
        }
    }

    private function databaseVersion(): string
    {
        $path = (string) config('services.maxmind.database_path');
        $modifiedAt = $path !== '' && is_file($path) ? filemtime($path) : false;

        return $modifiedAt === false ? 'missing' : (string) $modifiedAt;
    }
}
