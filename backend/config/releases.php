<?php

return [
    'disk' => env('VIBYRA_RELEASE_DISK', 'local'),
    'platforms' => [
        'windows' => [
            'label' => 'Vibyra for Windows',
            'version' => env('VIBYRA_WINDOWS_RELEASE_VERSION', '0.1.0'),
            'path' => env('VIBYRA_WINDOWS_RELEASE_PATH', 'releases/windows/Vibyra-Desktop-0.1.0-beta.1-x64-setup.exe'),
            'filename' => env('VIBYRA_WINDOWS_RELEASE_FILENAME', 'Vibyra-Desktop-0.1.0-beta.1-x64-setup.exe'),
            'size_bytes' => (int) env('VIBYRA_WINDOWS_RELEASE_SIZE', 8226976),
            'sha256' => env('VIBYRA_WINDOWS_RELEASE_SHA256', 'fd77cffe665147cab3b7cb44541c81ce618d97d5f36a33ee71f318377bd760c5'),
            // Minisign signature of the artifact above, emitted as a .sig
            // file by `tauri build`. Empty means "do not offer this as an
            // in-app update" — the desktop app would reject it anyway.
            'signature' => env('VIBYRA_WINDOWS_RELEASE_SIGNATURE', ''),
            'notes' => env('VIBYRA_WINDOWS_RELEASE_NOTES', ''),
            'published_at' => env('VIBYRA_WINDOWS_RELEASE_PUBLISHED_AT', ''),
            'expected_extension' => 'exe',
            'require_complete_metadata' => true,
        ],
        'linux' => [
            'label' => 'Vibyra for Linux',
            'version' => env('VIBYRA_LINUX_RELEASE_VERSION', '0.1.2'),
            'path' => env('VIBYRA_LINUX_RELEASE_PATH', 'releases/linux/Vibyra_0.1.2_amd64.AppImage'),
            'filename' => env('VIBYRA_LINUX_RELEASE_FILENAME', 'Vibyra.AppImage'),
            'size_bytes' => (int) env('VIBYRA_LINUX_RELEASE_SIZE', 157325816),
            'sha256' => env('VIBYRA_LINUX_RELEASE_SHA256', 'f7bfe1f6f66402ef6111a217f3710ab3b55fe665c12bfbc84341a18883a4b4f8'),
            // Minisign signature of the artifact above, emitted as a .sig
            // file by `tauri build`. Empty means "do not offer this as an
            // in-app update" — the desktop app would reject it anyway.
            'signature' => env('VIBYRA_LINUX_RELEASE_SIGNATURE', ''),
            'notes' => env('VIBYRA_LINUX_RELEASE_NOTES', ''),
            'published_at' => env('VIBYRA_LINUX_RELEASE_PUBLISHED_AT', ''),
            'expected_extension' => 'appimage',
            'require_complete_metadata' => true,
        ],
        'linux-deb' => [
            'label' => 'Vibyra for Debian/Ubuntu',
            'version' => env('VIBYRA_LINUX_DEB_RELEASE_VERSION', '0.1.2'),
            'path' => env('VIBYRA_LINUX_DEB_RELEASE_PATH', 'releases/linux/Vibyra_0.1.2_amd64.deb'),
            'filename' => env('VIBYRA_LINUX_DEB_RELEASE_FILENAME', 'Vibyra.deb'),
            'size_bytes' => (int) env('VIBYRA_LINUX_DEB_RELEASE_SIZE', 9406880),
            'sha256' => env('VIBYRA_LINUX_DEB_RELEASE_SHA256', '3bd5594a7778294167c5b8cc4d4794888014b027a1b40c495b5dea157c85887a'),
            // Minisign signature of the artifact above, emitted as a .sig
            // file by `tauri build`. Empty means "do not offer this as an
            // in-app update" — the desktop app would reject it anyway.
            'signature' => env('VIBYRA_LINUX_DEB_RELEASE_SIGNATURE', ''),
            'notes' => env('VIBYRA_LINUX_DEB_RELEASE_NOTES', ''),
            'published_at' => env('VIBYRA_LINUX_DEB_RELEASE_PUBLISHED_AT', ''),
            'expected_extension' => 'deb',
            'require_complete_metadata' => true,
        ],
        'macos-arm64' => [
            'label' => 'Vibyra for macOS (Apple Silicon)',
            'architecture' => 'arm64',
            'version' => env('VIBYRA_MACOS_ARM64_RELEASE_VERSION', ''),
            'path' => env('VIBYRA_MACOS_ARM64_RELEASE_PATH', ''),
            'filename' => env('VIBYRA_MACOS_ARM64_RELEASE_FILENAME', ''),
            'size_bytes' => (int) env('VIBYRA_MACOS_ARM64_RELEASE_SIZE', 0),
            'sha256' => env('VIBYRA_MACOS_ARM64_RELEASE_SHA256', ''),
            'minimum_system_version' => env('VIBYRA_MACOS_ARM64_MINIMUM_SYSTEM_VERSION', '12.0'),
            // Minisign signature of the artifact above, emitted as a .sig
            // file by `tauri build`. Empty means "do not offer this as an
            // in-app update" — the desktop app would reject it anyway.
            'signature' => env('VIBYRA_MACOS_ARM64_RELEASE_SIGNATURE', ''),
            'notes' => env('VIBYRA_MACOS_ARM64_RELEASE_NOTES', ''),
            'published_at' => env('VIBYRA_MACOS_ARM64_RELEASE_PUBLISHED_AT', ''),
            'expected_extension' => 'dmg',
            'require_complete_metadata' => true,
        ],
        'macos-x64' => [
            'label' => 'Vibyra for macOS (Intel)',
            'architecture' => 'x64',
            'version' => env('VIBYRA_MACOS_X64_RELEASE_VERSION', ''),
            'path' => env('VIBYRA_MACOS_X64_RELEASE_PATH', ''),
            'filename' => env('VIBYRA_MACOS_X64_RELEASE_FILENAME', ''),
            'size_bytes' => (int) env('VIBYRA_MACOS_X64_RELEASE_SIZE', 0),
            'sha256' => env('VIBYRA_MACOS_X64_RELEASE_SHA256', ''),
            'minimum_system_version' => env('VIBYRA_MACOS_X64_MINIMUM_SYSTEM_VERSION', '12.0'),
            // Minisign signature of the artifact above, emitted as a .sig
            // file by `tauri build`. Empty means "do not offer this as an
            // in-app update" — the desktop app would reject it anyway.
            'signature' => env('VIBYRA_MACOS_X64_RELEASE_SIGNATURE', ''),
            'notes' => env('VIBYRA_MACOS_X64_RELEASE_NOTES', ''),
            'published_at' => env('VIBYRA_MACOS_X64_RELEASE_PUBLISHED_AT', ''),
            'expected_extension' => 'dmg',
            'require_complete_metadata' => true,
        ],
    ],
];
