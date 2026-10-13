<?php

namespace App\Services\Account;

use App\Models\User;
use App\Services\Auth\ProviderChallengeService;
use App\Services\Auth\ProviderIdentityException;
use App\Services\Auth\ProviderIdentityVerifier;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

final class DeletionVerification
{
    /** @return array{error: string, status: int}|null */
    public function error(User $user, Request $request): ?array
    {
        if (($user->provider ?: 'email') === 'email') {
            $password = (string) $request->input('password', '');
            if ($password === '' || ! Hash::check($password, $user->password)) {
                return ['error' => 'Password is incorrect.', 'status' => 401];
            }

            return null;
        }

        try {
            $nonce = $user->provider === 'apple'
                ? app(ProviderChallengeService::class)->consume(
                    (string) $user->provider,
                    trim((string) $request->input('challengeId', ''))
                )
                : null;
            $identity = app(ProviderIdentityVerifier::class)->verify(
                (string) $user->provider,
                trim((string) $request->input('identityToken', '')),
                $nonce,
            );
        } catch (ProviderIdentityException) {
            return ['error' => 'Reauthenticate with your provider before deleting this account.', 'status' => 401];
        }
        if (! hash_equals((string) $user->provider_id, $identity['subject'])) {
            return ['error' => 'The provider account does not match this Vibyra account.', 'status' => 403];
        }

        if ($user->provider === 'apple') {
            $code = $request->input('authorizationCode', '');
            if (! is_string($code) || strlen($code) > 4096) {
                return ['error' => 'Apple authorization could not be read. Try again.', 'status' => 422];
            }
            try {
                $request->attributes->set('appleRevocation', app(AppleAccountRevocation::class)
                    ->native(trim($code), (string) $user->provider_id, (string) $nonce));
            } catch (ProviderIdentityException) {
                return ['error' => 'The Apple authorization does not match this account. Try again.', 'status' => 401];
            }
        }

        return null;
    }
}
