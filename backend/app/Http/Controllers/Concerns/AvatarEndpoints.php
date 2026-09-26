<?php

namespace App\Http\Controllers\Concerns;

use App\Services\Account\AvatarImage;
use App\Services\Account\AvatarRejected;
use App\Services\Account\AvatarStore;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\RateLimiter;
use Symfony\Component\HttpFoundation\Response;

/**
 * The account's profile photo: set it, remove it, and serve it. Setting and
 * removing answer with the account payload, so the phone's `avatarUrl` is always
 * the one the server now holds rather than something it has to work out.
 */
trait AvatarEndpoints
{
    public function uploadAccountAvatar(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        // Per account, not per address: the phone shares an address with everyone
        // on its network. Every attempt counts, because each one is decoded.
        $key = 'avatar-upload:'.$user->getKey();
        if (RateLimiter::tooManyAttempts($key, 10)) {
            $minutes = max(1, (int) ceil(RateLimiter::availableIn($key) / 60));

            return $this->json(['ok' => false, 'error' => "Too many photo changes. Try again in {$minutes} minutes."], 429);
        }
        RateLimiter::hit($key, 3600);

        $photo = $request->file('photo');
        if (! $photo instanceof UploadedFile || ! $photo->isValid() || $photo->getSize() > AvatarImage::MAX_BYTES) {
            return $this->json(['ok' => false, 'error' => AvatarImage::TYPE_ERROR], 422);
        }
        try {
            $image = app(AvatarImage::class)->fromFile((string) $photo->getRealPath());
        } catch (AvatarRejected $rejected) {
            return $this->json(['ok' => false, 'error' => $rejected->getMessage()], $rejected->status);
        }
        app(AvatarStore::class)->save((int) $user->getKey(), $image);

        return $this->json(['ok' => true, 'user' => $this->userPayload($user)]);
    }

    public function deleteAccountAvatar(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        app(AvatarStore::class)->remove((int) $user->getKey());

        return $this->json(['ok' => true, 'user' => $this->userPayload($user)]);
    }

    /**
     * Reached only through the signed URL in `avatarUrl`. A `v` that is not the
     * current photo is a 404 rather than the new bytes, because that URL was
     * promised to clients as immutable.
     */
    public function accountAvatar(Request $request, string $user): Response
    {
        $avatar = app(AvatarStore::class)->find((int) $user);
        $version = $request->query('v');
        if (! $avatar || ! is_string($version) || ! hash_equals(substr($avatar['sha256'], 0, 12), $version)) {
            abort(404);
        }
        $etag = '"'.$avatar['sha256'].'"';
        $headers = [
            'Content-Type' => 'image/jpeg',
            'ETag' => $etag,
            // Shared caching is for anonymous requests only (Infrastructure Coding Standard).
            'Cache-Control' => $request->headers->has('Authorization')
                ? 'private, no-store'
                : 'public, max-age=31536000, immutable',
            'X-Content-Type-Options' => 'nosniff',
        ];
        if (in_array($etag, $request->getETags(), true)) {
            return response('', 304, $headers);
        }

        return response($avatar['bytes'], 200, $headers + ['Content-Length' => (string) strlen($avatar['bytes'])]);
    }
}
