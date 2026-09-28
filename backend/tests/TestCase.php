<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    public static function openSslOptions(array $options = []): array
    {
        if (PHP_OS_FAMILY !== 'Windows') {
            return $options;
        }

        $programFiles = rtrim((string) getenv('ProgramFiles'), '/\\');
        foreach ([
            $programFiles.'/Git/mingw64/etc/ssl/openssl.cnf',
            $programFiles.'/Git/usr/ssl/openssl.cnf',
        ] as $candidate) {
            if (! is_file($candidate)) {
                continue;
            }

            return ['config' => $candidate, ...$options];
        }

        return $options;
    }
}
