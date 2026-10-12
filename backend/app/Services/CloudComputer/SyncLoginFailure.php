<?php
namespace App\Services\CloudComputer;

/** Runtime replies are untrusted text. Only fixed explanations may reach account clients. */
final class SyncLoginFailure
{
    public static function message(?string $error): string
    {
        return match ($error) {
            'sealed login hash mismatch' => 'The sign-in upload arrived damaged. Allow this account again.',
            'could not open the login' => 'Cloud could not unlock this sign-in. Allow this account again.',
            'could not write the login' => 'Cloud could not save this sign-in. Try again.',
            default => 'Vibyra Cloud could not finish this sign-in. Allow this account again.',
        };
    }
}
