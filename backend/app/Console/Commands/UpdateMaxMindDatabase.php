<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use PharData;

class UpdateMaxMindDatabase extends Command
{
    protected $signature = 'maxmind:update {--force : Download even when the local database is fresh}';
    protected $description = 'Download the GeoLite2 City database for local account-session location lookup.';

    public function handle(): int
    {
        $databasePath = (string) config('services.maxmind.database_path');
        if (! $databasePath) {
            $this->error('MAXMIND_DATABASE_PATH is empty.');
            return self::FAILURE;
        }

        if (! $this->option('force') && $this->databaseIsFresh($databasePath)) {
            $this->info('MaxMind GeoLite2 City database is fresh; skipping download.');
            return self::SUCCESS;
        }

        $lock = $this->acquireLock();
        if (! $lock) {
            $this->warn('Another MaxMind update is already running.');
            return self::SUCCESS;
        }

        try {
            $this->downloadAndInstall($databasePath);
            $this->info('MaxMind GeoLite2 City database updated.');
            return self::SUCCESS;
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    private function databaseIsFresh(string $databasePath): bool
    {
        if (! is_file($databasePath)) {
            return false;
        }

        $days = max(1, (int) config('services.maxmind.update_days', 7));
        return filemtime($databasePath) >= now()->subDays($days)->getTimestamp();
    }

    private function downloadAndInstall(string $databasePath): void
    {
        $licenseKey = (string) config('services.maxmind.license_key');
        if ($licenseKey === '') {
            throw new \RuntimeException('MAXMIND_LICENSE_KEY is not configured.');
        }

        $workDir = storage_path('app/maxmind/tmp-'.bin2hex(random_bytes(6)));
        $archivePath = "{$workDir}/GeoLite2-City.tar.gz";
        $tarPath = "{$workDir}/GeoLite2-City.tar";
        $extractDir = "{$workDir}/extract";

        if (! is_dir($workDir)) {
            mkdir($workDir, 0755, true);
        }

        try {
            $response = Http::timeout(120)
                ->retry(2, 1500)
                ->sink($archivePath)
                ->get('https://download.maxmind.com/app/geoip_download', [
                    'edition_id' => 'GeoLite2-City',
                    'license_key' => $licenseKey,
                    'suffix' => 'tar.gz',
                ]);

            if (! $response->successful() || ! is_file($archivePath) || filesize($archivePath) < 1024) {
                throw new \RuntimeException('MaxMind database download failed.');
            }

            (new PharData($archivePath))->decompress();
            if (! is_dir($extractDir)) {
                mkdir($extractDir, 0755, true);
            }
            (new PharData($tarPath))->extractTo($extractDir, null, true);

            $source = $this->findDatabaseFile($extractDir);
            if (! $source) {
                throw new \RuntimeException('Downloaded MaxMind archive did not contain GeoLite2-City.mmdb.');
            }

            $targetDir = dirname($databasePath);
            if (! is_dir($targetDir)) {
                mkdir($targetDir, 0755, true);
            }

            $tmpTarget = "{$databasePath}.tmp";
            copy($source, $tmpTarget);
            rename($tmpTarget, $databasePath);
        } finally {
            $this->removeDirectory($workDir);
        }
    }

    private function acquireLock()
    {
        $lockPath = storage_path('app/maxmind/update.lock');
        $lockDir = dirname($lockPath);
        if (! is_dir($lockDir)) {
            mkdir($lockDir, 0755, true);
        }

        $handle = fopen($lockPath, 'c');
        if (! $handle || ! flock($handle, LOCK_EX | LOCK_NB)) {
            if ($handle) {
                fclose($handle);
            }

            return null;
        }

        return $handle;
    }

    private function findDatabaseFile(string $dir): ?string
    {
        $matches = glob($dir.'/GeoLite2-City_*/GeoLite2-City.mmdb');
        return $matches && is_file($matches[0]) ? $matches[0] : null;
    }

    private function removeDirectory(string $dir): void
    {
        if (! is_dir($dir)) {
            return;
        }

        $items = scandir($dir) ?: [];
        foreach ($items as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }

            $path = "{$dir}/{$item}";
            is_dir($path) ? $this->removeDirectory($path) : @unlink($path);
        }

        @rmdir($dir);
    }
}
