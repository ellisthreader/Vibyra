<?php

namespace Tests\Unit;

use App\Models\User;
use App\Services\ChatConnectors\AccountMask;
use Tests\TestCase;

/** The only thing the connect confirmation page shows about a Vibyra account: enough to recognise it, never enough to identify it. */
class AccountMaskTest extends TestCase
{
    public function test_an_email_keeps_its_first_letter_four_dots_and_its_domain(): void
    {
        foreach ([
            'ellis@gmail.com' => 'e••••@gmail.com',
            'Ellis.Taylor+vibyra@Gmail.COM' => 'E••••@gmail.com',
            'someone@sub.example.co.uk' => 's••••@sub.example.co.uk',
            'éclair@exemple.fr' => 'é••••@exemple.fr',
            'a@x.io' => '••••@x.io', // a one-letter name would be shown whole
            'ab@x.io' => 'a••••@x.io',
        ] as $email => $masked) $this->assertSame($masked, AccountMask::email($email), $email);
        $this->assertStringNotContainsString('llis', AccountMask::email('ellis.taylor@gmail.com'));
    }

    public function test_the_length_of_the_name_is_not_revealed(): void
    {
        $this->assertSame(mb_strlen(AccountMask::email('ab@x.io')), mb_strlen(AccountMask::email('abcdefghijklmnop@x.io')));
    }

    public function test_an_account_is_named_by_its_email_then_its_display_name_and_guests_by_neither(): void
    {
        $this->assertSame('e••••@gmail.com', AccountMask::for(new User(['email' => 'ellis@gmail.com', 'name' => 'Ellis Taylor'])));
        $this->assertSame('E••••', AccountMask::for(new User(['email' => '', 'name' => 'Ellis Taylor'])));
        $this->assertSame('E••••', AccountMask::for(new User(['email' => 'not-an-address', 'name' => 'Ellis Taylor'])));
        $this->assertSame('Guest', AccountMask::for(new User(['email' => 'guest-1@guests.vibyra.invalid', 'name' => 'Guest', 'guest_at' => now()])));
        $this->assertSame('Guest', AccountMask::for(new User(['email' => 'guest-1@guests.vibyra.invalid', 'name' => 'Ellis', 'guest_at' => now()])));
        $this->assertSame('Guest', AccountMask::for(new User(['email' => 'x@guests.vibyra.invalid', 'name' => 'Guest'])));
        $this->assertSame('Unnamed', AccountMask::for(null));
        $this->assertSame('Unnamed', AccountMask::for(new User(['email' => '', 'name' => ''])));
    }
}
