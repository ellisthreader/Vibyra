<?php

namespace App\Services\Integrations;

class Catalog
{
    public static function all(): array
    {
        $g = 'https://www.googleapis.com/auth/';

        return [
            'gmail' => ['Google', 'Gmail', 'Read recent email subjects and previews', "openid email {$g}gmail.readonly"],
            'google-calendar' => ['Google', 'Google Calendar', 'Read upcoming events', "openid email {$g}calendar.events.readonly"],
            'google-drive' => ['Google', 'Google Drive', 'Find file names and links', "openid email {$g}drive.metadata.readonly"],
            'outlook' => ['Microsoft', 'Outlook', 'Read recent email subjects and previews', 'openid offline_access User.Read Mail.Read'],
            'microsoft-calendar' => ['Microsoft', 'Microsoft Calendar', 'Read upcoming events', 'openid offline_access User.Read Calendars.Read'],
            'onedrive' => ['Microsoft', 'OneDrive', 'List files and folders', 'openid offline_access User.Read Files.Read'],
            'stripe' => ['Stripe', 'Stripe', 'Review recent payments', 'stripe_apps'],
            'shopify' => ['Shopify', 'Shopify', 'Review products and recent orders', 'read_products,read_orders'],
            'github' => ['GitHub', 'GitHub', 'List public repositories', 'read:user'],
        ];
    }

    public static function get(string $service): array
    {
        abort_unless(isset(self::all()[$service]), 422, 'Unknown integration.');
        [$family, $name, $description, $scope] = self::all()[$service];
        $provider = strtolower($family);
        $settings = (array) config("integrations.$provider", []);

        return compact('service', 'provider', 'name', 'description', 'scope', 'settings');
    }

    public static function ready(array $p): bool
    {
        if ($p['provider'] === 'stripe' && empty($p['settings']['install_url'])) {
            return false;
        }

        return filled($p['settings']['client_id'] ?? null) && filled($p['settings']['client_secret'] ?? null)
            && str_starts_with((string) config('app.url'), 'https://');
    }

    public static function visible(): array
    {
        return array_map(function ($id): array {
            $p = self::get($id);

            return ['id' => $id, 'name' => $p['name'], 'description' => $p['description'],
                'provider' => $p['provider'], 'ready' => self::ready($p)];
        }, array_keys(self::all()));
    }

    public static function callback(string $service): string
    {
        return rtrim(config('app.url'), '/').'/api/integrations/callback/'.$service;
    }

    public static function shop(string $shop): string
    {
        $shop = strtolower(trim($shop));
        abort_unless(preg_match('/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/D', $shop) && strlen($shop) < 100,
            422, 'Enter your store address, such as my-shop.myshopify.com.');

        return $shop;
    }
}
