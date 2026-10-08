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
            ->assertSee('support@vibyra.net');
    }

    public function test_terms_are_public_and_link_back_to_the_privacy_policy(): void
    {
        $this->get('/legal/terms')
            ->assertOk()
            ->assertSee('Terms of Service')
            ->assertSee('AI output and third-party services')
            ->assertSee(route('legal.privacy'));
    }

    public function test_each_public_legal_and_privacy_request_page_is_available_without_an_account(): void
    {
        foreach ([
            '/legal/cookies' => 'Cookies and local storage',
            '/legal/refunds' => 'Refunds and cancellation',
            '/legal/community' => 'Community rules and reports',
            '/legal/accessibility' => 'Accessibility',
            '/privacy/requests' => 'Privacy requests',
        ] as $path => $heading) {
            $this->get($path)->assertOk()->assertSee($heading);
        }
    }

    public function test_community_rules_show_the_default_off_release_state(): void
    {
        config(['legal.community_enabled' => false]);
        $this->get('/legal/community')->assertOk()
            ->assertSee('Community sharing is not available during this launch stage');

        config(['legal.community_enabled' => true]);
        $this->get('/legal/community')->assertOk()
            ->assertDontSee('Community sharing is not available during this launch stage');
    }

    public function test_terms_only_promise_a_pro_trial_when_new_accounts_can_receive_it(): void
    {
        config(['membership.enabled' => false, 'membership.trial_days' => 21]);
        $this->get('/legal/terms')->assertOk()->assertDontSee('one free 21-day Vibyra Pro trial');

        config([
            'membership.enabled' => true,
            'membership.new_accounts_from' => now()->subDay()->toIso8601String(),
        ]);
        $this->get('/legal/terms')->assertOk()->assertSee('one free 21-day Vibyra Pro trial');
    }

}
