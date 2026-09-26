<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Tests\Feature\Support\AvatarFixtures;
use Tests\TestCase;

class AccountAvatarUploadTest extends TestCase
{
    use AvatarFixtures;
    use RefreshDatabase;

    public function test_each_accepted_format_is_stored_as_a_512_square_jpeg(): void
    {
        $token = $this->signupToken();
        $formats = [['jpeg', 'photo.jpg', 'image/jpeg'], ['png', 'photo.png', 'image/png']];
        if (function_exists('imagewebp')) {
            $formats[] = ['webp', 'photo.webp', 'image/webp'];
        }
        foreach ($formats as [$type, $name, $mime]) {
            $photo = $this->photo($this->encoded($this->drawing(900, 600), $type), $name, $mime);
            $response = $this->post('/api/account/avatar', ['photo' => $photo], $this->bearer($token))->assertOk();

            $response->assertJsonPath('ok', true);
            $this->assertStringContainsString('/api/account/avatar/', (string) $response->json('user.avatarUrl'));
            $size = getimagesizefromstring($this->storedAvatar());
            $this->assertSame([512, 512, IMAGETYPE_JPEG], [$size[0], $size[1], $size[2]], "{$type} is stored as a 512 JPEG");
        }
        $this->assertSame(1, DB::table('user_avatars')->count(), 'One photo per account');
    }

    public function test_a_wide_photo_is_cropped_from_its_centre(): void
    {
        $token = $this->signupToken();
        // 1200x400: the centre square is x 400..800, which straddles the colour split.
        $photo = $this->photo($this->encoded($this->drawing(1200, 400), 'png'), 'wide.png', 'image/png');
        $this->post('/api/account/avatar', ['photo' => $photo], $this->bearer($token))->assertOk();

        [$leftRed] = $this->colourAt($this->storedAvatar(), 40, 256);
        [, , $rightBlue] = $this->colourAt($this->storedAvatar(), 470, 256);
        $this->assertGreaterThan(150, $leftRed);
        $this->assertGreaterThan(150, $rightBlue);
    }

    public function test_metadata_including_gps_is_stripped_and_orientation_is_applied(): void
    {
        $token = $this->signupToken();
        // Stored landscape with Orientation 6: it is meant to be seen turned a
        // quarter clockwise, which brings the left (red) half to the top.
        $jpeg = $this->withExif($this->encoded($this->drawing(800, 400), 'jpeg'), 6);
        $this->assertStringContainsString('Exif', $jpeg);
        $this->assertStringContainsString('GPSLatitude', $jpeg);

        $this->post('/api/account/avatar', ['photo' => $this->photo($jpeg, 'camera.jpg', 'image/jpeg')], $this->bearer($token))
            ->assertOk();

        $stored = $this->storedAvatar();
        $this->assertStringNotContainsString('Exif', $stored);
        $this->assertStringNotContainsString('GPSLatitude', $stored);
        if (! function_exists('exif_read_data')) {
            $this->markTestIncomplete('The exif extension is not loaded, so orientation is left as stored.');
        }
        [$topRed] = $this->colourAt($stored, 256, 20);
        [, , $bottomBlue] = $this->colourAt($stored, 256, 490);
        $this->assertGreaterThan(150, $topRed, 'The photo was turned upright before its metadata was dropped');
        $this->assertGreaterThan(150, $bottomBlue);
    }

    public function test_other_types_oversized_files_and_huge_canvases_are_refused(): void
    {
        $token = $this->signupToken();
        $cases = [
            'gif' => [$this->photo($this->encoded($this->drawing(64, 64), 'gif'), 'a.gif', 'image/gif'), 'Choose a JPEG, PNG or WebP photo under 5 MB.'],
            'text' => [$this->photo('not a picture', 'notes.jpg', 'image/jpeg'), 'Choose a JPEG, PNG or WebP photo under 5 MB.'],
            'over 5 MB' => [UploadedFile::fake()->create('big.jpg', 5 * 1024 + 1, 'image/jpeg'), 'Choose a JPEG, PNG or WebP photo under 5 MB.'],
            'over 40 MP' => [$this->photo($this->declaredPng(8000, 6000), 'huge.png', 'image/png'), 'That photo is too large. Choose one under 40 megapixels.'],
        ];
        foreach ($cases as $label => [$photo, $message]) {
            $this->post('/api/account/avatar', ['photo' => $photo], $this->bearer($token))
                ->assertStatus(422)
                ->assertExactJson(['ok' => false, 'error' => $message]);
        }
        $this->post('/api/account/avatar', [], $this->bearer($token))->assertStatus(422);
        $this->assertSame(0, DB::table('user_avatars')->count(), 'Nothing refused was stored');
    }

    public function test_it_needs_a_signed_in_account(): void
    {
        $photo = $this->photo($this->encoded($this->drawing(100, 100), 'png'), 'a.png', 'image/png');
        $this->post('/api/account/avatar', ['photo' => $photo], ['Accept' => 'application/json'])->assertUnauthorized();
        $this->deleteJson('/api/account/avatar')->assertUnauthorized();
    }

    public function test_removing_the_photo_clears_it_from_the_account(): void
    {
        $token = $this->signupToken();
        $photo = $this->photo($this->encoded($this->drawing(300, 300), 'png'), 'a.png', 'image/png');
        $url = $this->post('/api/account/avatar', ['photo' => $photo], $this->bearer($token))->json('user.avatarUrl');

        $this->deleteJson('/api/account/avatar', [], $this->bearer($token))
            ->assertOk()->assertJsonPath('ok', true)->assertJsonPath('user.avatarUrl', null);
        $this->getJson('/api/session', $this->bearer($token))->assertJsonPath('user.avatarUrl', null);
        $this->get($this->relative($url))->assertNotFound();
    }

    public function test_photo_changes_are_limited_per_account(): void
    {
        $token = $this->signupToken();
        for ($attempt = 0; $attempt < 10; $attempt++) {
            $this->post('/api/account/avatar', ['photo' => $this->photo('nope', 'a.jpg', 'image/jpeg')], $this->bearer($token))
                ->assertStatus(422);
        }
        $this->post('/api/account/avatar', ['photo' => $this->photo('nope', 'a.jpg', 'image/jpeg')], $this->bearer($token))
            ->assertStatus(429)->assertJsonPath('ok', false);
    }
}
