<?php

namespace Tests\Feature\Concerns\NextTen;

use App\Services\VibyraDesktopState;
use App\Services\Referrals\ReferralService;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use GuzzleHttp\Psr7\Response as GuzzleResponse;

trait TestsAuthAccountLifecycle
{
    public function test_email_signup_creates_free_account_and_persists_state(): void
        {
            $signup = $this->postJson('/api/auth/signup', [
                'name' => 'Alex Carter',
                'email' => 'alex@example.com',
                'password' => 'secret123',
            ]);

            $token = $signup
                ->assertCreated()
                ->assertJsonPath('user.plan', 'free')
                ->assertJsonPath('user.creditsBalance', 50)
                ->json('token');

            $headers = ['Authorization' => "Bearer {$token}"];

            $this->postJson('/api/onboarding/complete', [], $headers)
                ->assertOk()
                ->assertJsonPath('user.onboardingComplete', true);

            $this->postJson('/api/session/state', [
                'rememberedDesktops' => [[
                    'url' => 'http://127.0.0.1:4317',
                    'pairCode' => 'ABCD12',
                    'machineName' => 'Vibyra Desktop',
                    'status' => 'online',
                ]],
                'appState' => ['selectedChatModel' => 'gpt-5.4-mini'],
            ], $headers)
                ->assertOk()
                ->assertJsonPath('user.rememberedDesktops.0.pairCode', 'ABCD12');
        }

    public function test_delete_account_requires_password_and_removes_user_session(): void
        {
            $token = $this->postJson("/api/auth/signup", [
                "name" => "Delete Me",
                "email" => "delete-me@example.com",
                "password" => "secret123",
            ])->assertCreated()->json("token");

            $headers = ["Authorization" => "Bearer " . $token];

            $this->deleteJson("/api/account", ["password" => "wrong-password"], $headers)
                ->assertUnauthorized()
                ->assertJsonPath("error", "Password is incorrect.");

            $this->assertDatabaseHas("users", ["email" => "delete-me@example.com"]);

            $this->deleteJson("/api/account", ["password" => "secret123"], $headers)
                ->assertOk()
                ->assertJsonPath("ok", true);

            $this->assertDatabaseMissing("users", ["email" => "delete-me@example.com"]);
            $this->assertSame(0, DB::table("vibyra_sessions")->count());
        }
}
