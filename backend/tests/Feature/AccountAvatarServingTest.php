<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\URL;
use Tests\Feature\Support\AvatarFixtures;
use Tests\TestCase;

class AccountAvatarServingTest extends TestCase
{
    use AvatarFixtures;
    use RefreshDatabase;

    public function test_the_signed_url_serves_the_photo_as_an_immutable_file(): void
    {
        $url = $this->uploaded($this->signupToken());

        $response = $this->get($this->relative($url))->assertOk();
        $this->assertSame('image/jpeg', $response->headers->get('Content-Type'));
        $cache = (string) $response->headers->get('Cache-Control');
        foreach (['public', 'max-age=31536000', 'immutable'] as $directive) {
            $this->assertStringContainsString($directive, $cache);
        }
        $this->assertSame('"'.DB::table('user_avatars')->value('sha256').'"', $response->headers->get('ETag'));
        $this->assertNull($response->headers->get('Set-Cookie'), 'A shared-cacheable photo carries no session');
        $this->assertSame([512, 512], array_slice(getimagesizefromstring($response->getContent()), 0, 2));

        $this->get($this->relative($url), ['If-None-Match' => $response->headers->get('ETag')])->assertStatus(304);
        $private = $this->get($this->relative($url), ['Authorization' => 'Bearer anything']);
        $this->assertStringContainsString('no-store', (string) $private->headers->get('Cache-Control'));
    }

    public function test_an_unsigned_or_altered_url_is_refused(): void
    {
        $url = $this->uploaded($this->signupToken());
        $path = parse_url($url, PHP_URL_PATH);
        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);

        $this->get($path.'?v='.$query['v'])->assertForbidden();
        $this->get($path.'?v='.$query['v'].'&signature='.str_repeat('0', 64))->assertForbidden();
        $userId = DB::table('user_avatars')->value('user_id');
        $other = preg_replace('#/avatar/\d+#', '/avatar/'.($userId + 1), $this->relative($url));
        $this->get($other)->assertForbidden();
    }

    public function test_a_new_photo_is_a_new_url_and_the_old_one_stops_answering(): void
    {
        $token = $this->signupToken();
        $first = $this->uploaded($token);
        $second = $this->uploaded($token, [30, 160, 60]);

        $this->assertNotSame($first, $second);
        parse_str((string) parse_url($second, PHP_URL_QUERY), $query);
        $this->assertSame(substr((string) DB::table('user_avatars')->value('sha256'), 0, 12), $query['v']);
        $this->get($this->relative($first))->assertNotFound();
        $this->get($this->relative($second))->assertOk();

        // A correctly signed URL for a version that no longer exists is still not served.
        $stale = URL::signedRoute('account.avatar', ['user' => DB::table('user_avatars')->value('user_id'), 'v' => 'aaaaaaaaaaaa'], absolute: false);
        $this->get($stale)->assertNotFound();
    }

    public function test_the_url_is_https_behind_railways_proxy_and_valid_on_any_host(): void
    {
        $token = $this->signupToken();
        $this->uploaded($token);
        $proxied = $this->getJson('/api/session', $this->bearer($token) + [
            'X-Forwarded-Proto' => 'https',
            'X-Forwarded-Host' => 'vibyra-production.up.railway.app',
            'X-Forwarded-Port' => '443',
        ])->json('user.avatarUrl');

        $this->assertStringStartsWith('https://vibyra-production.up.railway.app/api/account/avatar/', $proxied);
        // Signed over path and query only, so the address the app saw does not matter.
        $this->get($this->relative($proxied))->assertOk();
    }

    public function test_an_account_without_a_photo_reports_null(): void
    {
        $this->getJson('/api/session', $this->bearer($this->signupToken()))
            ->assertOk()->assertJsonPath('user.avatarUrl', null);
    }

    public function test_deleting_the_account_deletes_its_photo(): void
    {
        $token = $this->signupToken();
        $url = $this->uploaded($token);
        $this->assertSame(1, DB::table('user_avatars')->count());

        $this->deleteJson('/api/account', ['password' => 'secret123'], $this->bearer($token))->assertOk();
        $this->assertSame(0, DB::table('user_avatars')->count());
        $this->get($this->relative($url))->assertNotFound();

        // The provider deletion callback removes the user the same way.
        $this->uploaded($this->signupToken('second@example.com'));
        User::where('email', 'second@example.com')->firstOrFail()->delete();
        $this->assertSame(0, DB::table('user_avatars')->count());
    }

    private function uploaded(string $token, array $colour = [220, 30, 30]): string
    {
        $photo = $this->photo($this->encoded($this->drawing(400, 400, $colour, $colour), 'png'), 'a.png', 'image/png');

        return (string) $this->post('/api/account/avatar', ['photo' => $photo], $this->bearer($token))
            ->assertOk()->json('user.avatarUrl');
    }
}
