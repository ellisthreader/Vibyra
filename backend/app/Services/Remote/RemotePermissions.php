<?php

namespace App\Services\Remote;

class RemotePermissions
{
    public const ALL = ['screen:view', 'mouse:control', 'keyboard:control', 'clipboard:read', 'clipboard:write',
        'terminal:access', 'files:read', 'files:download', 'files:upload', 'preview:access'];

    public static function normalize(array $permissions): array
    {
        if (count($permissions) > count(self::ALL)) throw new RemoteAccessException('Invalid remote permissions.', 422);
        foreach ($permissions as $permission) {
            if (! is_string($permission) || ! in_array($permission, self::ALL, true)) {
                throw new RemoteAccessException('Invalid remote permissions.', 422);
            }
        }
        $permissions = array_values(array_unique($permissions));
        sort($permissions);
        return $permissions;
    }
}
