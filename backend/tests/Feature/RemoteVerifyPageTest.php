<?php
namespace Tests\Feature;

use Tests\TestCase;

class RemoteVerifyPageTest extends TestCase
{
    public function test_the_passkey_page_and_its_assets_are_served(): void
    {
        $this->get('/remote/verify')->assertOk()->assertSee('Verify remote access')
            ->assertSee('/security/passkey.js', false)->assertHeader('Cache-Control', 'no-store, private');
        $this->assertFileExists(public_path('security/passkey.js'));
        $this->assertFileExists(public_path('security/passkey.css'));
    }
}
