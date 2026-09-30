<?php

namespace App\Http\Middleware;

use Illuminate\Http\Request;

class LocalOwnerAccess
{
    public const EMAIL = 'owner.local@vibyra.test';

    public static function available(Request $request): bool
    {
        return app()->environment('local')
            && config('database.default') === 'sqlite'
            && in_array($request->getHost(), ['127.0.0.1', 'localhost'], true)
            && in_array($request->ip(), ['127.0.0.1', '::1'], true);
    }
}
