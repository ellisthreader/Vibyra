<?php

namespace App\Services\Concerns;

trait DesktopHomeDirectory
{
    private function desktopHomeDirectory(): string
    {
        $candidates = PHP_OS_FAMILY === 'Windows'
            ? [
                ((string) getenv('HOMEDRIVE')).((string) getenv('HOMEPATH')),
                getenv('USERPROFILE'),
                getenv('HOME'),
            ]
            : [getenv('HOME')];

        foreach ($candidates as $candidate) {
            $path = rtrim((string) $candidate, '/\\');
            if ($path !== '' && is_dir($path)) {
                return realpath($path) ?: $path;
            }
        }

        return '';
    }

    private function isWithinDesktopHome(string $path, string $home): bool
    {
        $normalize = static function (string $value): string {
            $value = rtrim(str_replace('\\', '/', $value), '/');

            return PHP_OS_FAMILY === 'Windows' ? strtolower($value) : $value;
        };

        $path = $normalize($path);
        $home = $normalize($home);

        return $home !== '' && ($path === $home || str_starts_with($path.'/', $home.'/'));
    }
}
