<?php

// macOS installs from a DMG, but Tauri updates from a signed app archive.
return collect(['arm64', 'x64'])->mapWithKeys(function (string $arch): array {
    $prefix = 'VIBYRA_MACOS_'.strtoupper($arch);

    return ['macos-'.$arch => [
        'architecture' => $arch,
        'version' => env($prefix.'_RELEASE_VERSION', ''),
        'path' => env($prefix.'_UPDATE_PATH', ''),
        'filename' => env($prefix.'_UPDATE_FILENAME', ''),
        'size_bytes' => (int) env($prefix.'_UPDATE_SIZE', 0),
        'sha256' => env($prefix.'_UPDATE_SHA256', ''),
        'signature' => env($prefix.'_UPDATE_SIGNATURE', ''),
        'notes' => env($prefix.'_RELEASE_NOTES', ''),
        'published_at' => env($prefix.'_RELEASE_PUBLISHED_AT', ''),
        'minimum_system_version' => '12.0',
        'expected_extension' => 'gz',
        'require_complete_metadata' => true,
    ]];
})->all();
