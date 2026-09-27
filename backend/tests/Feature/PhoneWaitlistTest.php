<?php

namespace Tests\Feature;

use App\Models\PhoneWaitlistSignup;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class PhoneWaitlistTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    public function test_it_stores_a_normalized_address(): void
    {
        $this->postJson('/web-api/phone-waitlist', ['email' => '  Test.Person@Example.COM '])
            ->assertOk()
            ->assertJson(['ok' => true]);

        $signup = PhoneWaitlistSignup::query()->sole();
        $this->assertSame('test.person@example.com', $signup->email);
        $this->assertSame(PhoneWaitlistSignup::SOURCE_MARKETING_HOME, $signup->source);
    }

    public function test_a_repeat_address_is_accepted_without_a_duplicate_row(): void
    {
        $this->postJson('/web-api/phone-waitlist', ['email' => 'twice@example.com'])->assertOk();
        $this->postJson('/web-api/phone-waitlist', ['email' => 'TWICE@example.com'])
            ->assertOk()
            ->assertJson(['ok' => true]);

        $this->assertSame(1, PhoneWaitlistSignup::query()->count());
    }

    public function test_it_rejects_an_address_it_cannot_reach(): void
    {
        foreach (['', 'nope', 'still@nope', str_repeat('a', 250).'@example.com'] as $email) {
            $this->postJson('/web-api/phone-waitlist', ['email' => $email])
                ->assertStatus(422)
                ->assertJson(['ok' => false]);
        }

        $this->assertSame(0, PhoneWaitlistSignup::query()->count());
    }

    public function test_it_throttles_a_flood_of_signups(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/web-api/phone-waitlist', ['email' => "person{$i}@example.com"])->assertOk();
        }

        $this->postJson('/web-api/phone-waitlist', ['email' => 'person5@example.com'])->assertStatus(429);
    }
}
