<?php

namespace Tests\Feature;

use Tests\TestCase;

class LegalPagesTest extends TestCase
{
    public function test_privacy_policy_is_public_and_describes_product_data_flows(): void
    {
        $this->get('/legal/privacy')
            ->assertOk()
            ->assertSee('Privacy Policy')
            ->assertSee('Local and cloud processing')
            ->assertSee('Community content')
            ->assertSee('support@vibyra.app');
    }

    public function test_terms_are_public_and_link_back_to_the_privacy_policy(): void
    {
        $this->get('/legal/terms')
            ->assertOk()
            ->assertSee('Terms of Service')
            ->assertSee('AI output and third-party services')
            ->assertSee(route('legal.privacy'));
    }
}
