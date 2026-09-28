<?php

namespace App\Services\Account;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\URL;

/**
 * The `user_avatars` table, and the signed address a photo is fetched from.
 *
 * The URL is signed over its path and query only (`signed:relative`), then made
 * absolute from the request. Railway terminates TLS and forwards plain HTTP, and
 * a signature over the absolute URL would break the day the host or scheme seen
 * by the app differs from the one the phone used. `v` is the start of the photo's
 * hash: a new photo is a new URL, so a URL's bytes never change and can be cached
 * for good. Account deletion needs nothing here — the row cascades with the user.
 */
final class AvatarStore
{
    public const ROUTE = 'account.avatar';

    /** @param array{bytes: string, sha256: string, width: int, height: int} $image */
    public function save(int $userId, array $image): void
    {
        $now = now();
        DB::table('user_avatars')->upsert([[
            'user_id' => $userId,
            'data' => base64_encode($image['bytes']),
            'sha256' => $image['sha256'],
            'width' => $image['width'],
            'height' => $image['height'],
            'created_at' => $now,
            'updated_at' => $now,
        ]], ['user_id'], ['data', 'sha256', 'width', 'height', 'updated_at']);
    }

    public function remove(int $userId): void
    {
        DB::table('user_avatars')->where('user_id', $userId)->delete();
    }

    /** Reads the hash only. `userPayload` calls this on every session check, so it must never pull the photo itself. */
    public function version(int $userId): ?string
    {
        $sha = DB::table('user_avatars')->where('user_id', $userId)->value('sha256');

        return is_string($sha) && $sha !== '' ? substr($sha, 0, 12) : null;
    }

    public function url(User $user): ?string
    {
        $version = $this->version((int) $user->getKey());
        if ($version === null) {
            return null;
        }

        return url(URL::signedRoute(self::ROUTE, ['user' => $user->getKey(), 'v' => $version], absolute: false));
    }

    /** @return array{bytes: string, sha256: string}|null */
    public function find(int $userId): ?array
    {
        $row = DB::table('user_avatars')->where('user_id', $userId)->first(['data', 'sha256']);
        $bytes = $row ? base64_decode((string) $row->data, true) : false;

        return $bytes === false || $bytes === '' ? null : ['bytes' => $bytes, 'sha256' => (string) $row->sha256];
    }
}
