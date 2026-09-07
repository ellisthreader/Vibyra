<?php

namespace App\Services\Integrations;

use Illuminate\Support\Facades\Cache;

class IntegrationLock
{
    public static function run(int $user, string $service, string $shop, callable $action): mixed
    {
        $provider = Catalog::get($service)['provider'];
        // Shopify has one rotating offline token per app/store, across Vibyra accounts too.
        // Other providers serialize reconnect against refresh for the account/provider pair.
        $scope = $provider === 'shopify' ? 'shop:'.Catalog::shop($shop) : $user.':'.$provider;

        return Cache::lock('integration:'.hash('sha256', $scope), 300)->block(5, $action);
    }
}
