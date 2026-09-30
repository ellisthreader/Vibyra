<?php

namespace App\Services\ChatConnectors;

use App\Models\User;

/**
 * How a Vibyra account is named on the connect confirmation page (`e••••@gmail.com`): enough for its owner to
 * recognise it, never enough for a stranger who was forwarded the link to learn who started the sign-in. One first
 * letter, a fixed run of dots (so the length of the name is not shown either), and the domain.
 */
final class AccountMask
{
    private const DOTS = '••••';

    public static function for(?User $user): string
    {
        if ($user === null) return 'Unnamed';
        $email = trim((string) $user->email);
        $guest = $user->isGuest() || str_ends_with(strtolower($email), '.invalid'); // a guest address is a placeholder, not an identity
        if ($guest) return 'Guest';
        if (str_contains($email, '@')) return self::email($email);
        $name = trim((string) $user->name);
        return $name === '' ? 'Unnamed' : mb_substr($name, 0, 1).self::DOTS;
    }

    public static function email(string $email): string
    {
        $at = strrpos($email, '@');
        if ($at === false) return mb_substr(trim($email), 0, 1).self::DOTS;
        $local = substr($email, 0, $at);
        return (mb_strlen($local) > 1 ? mb_substr($local, 0, 1) : '').self::DOTS.'@'.strtolower(substr($email, $at + 1));
    }
}
