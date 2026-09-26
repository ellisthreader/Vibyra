<?php

namespace Tests\Feature\Support;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;

/** Photos drawn with GD for the avatar tests, plus an account to own them. */
trait AvatarFixtures
{
    /** @var list<string> */
    private array $avatarFiles = [];

    protected function tearDown(): void
    {
        foreach ($this->avatarFiles as $file) {
            @unlink($file);
        }
        parent::tearDown();
    }

    protected function signupToken(string $email = 'photo-owner@example.com'): string
    {
        return $this->postJson('/api/auth/signup', [
            'name' => 'Photo Owner',
            'email' => $email,
            'password' => 'secret123',
            'deviceName' => 'Vibyra App',
        ])->assertCreated()->json('token');
    }

    protected function bearer(string $token): array
    {
        return ['Authorization' => "Bearer {$token}", 'Accept' => 'application/json'];
    }

    /** Left half one colour, right half another, so crop and rotation can be seen. */
    protected function drawing(int $width, int $height, array $left = [220, 30, 30], array $right = [30, 30, 220]): \GdImage
    {
        $image = imagecreatetruecolor($width, $height);
        imagefilledrectangle($image, 0, 0, intdiv($width, 2) - 1, $height - 1, imagecolorallocate($image, ...$left));
        imagefilledrectangle($image, intdiv($width, 2), 0, $width - 1, $height - 1, imagecolorallocate($image, ...$right));

        return $image;
    }

    protected function encoded(\GdImage $image, string $type): string
    {
        ob_start();
        match ($type) {
            'jpeg' => imagejpeg($image, null, 95),
            'png' => imagepng($image),
            'webp' => imagewebp($image),
            'gif' => imagegif($image),
        };

        return (string) ob_get_clean();
    }

    protected function photo(string $bytes, string $name, string $mime): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'avatar-test-');
        file_put_contents($path, $bytes);
        $this->avatarFiles[] = $path;

        return new UploadedFile($path, $name, $mime, null, true);
    }

    /**
     * An EXIF APP1 segment with one Orientation entry (and a GPS-looking string, so
     * its absence afterwards means something), placed straight after the JPEG's SOI.
     */
    protected function withExif(string $jpeg, int $orientation): string
    {
        $entry = pack('vvVv', 0x0112, 3, 1, $orientation)."\0\0";
        $tiff = "II\x2A\x00".pack('V', 8).pack('v', 1).$entry.pack('V', 0).'GPSLatitude 51.5074N';
        $payload = "Exif\0\0".$tiff;

        return substr($jpeg, 0, 2)."\xFF\xE1".pack('n', strlen($payload) + 2).$payload.substr($jpeg, 2);
    }

    /** A PNG that declares a canvas without carrying one: only its header is ever read. */
    protected function declaredPng(int $width, int $height): string
    {
        $ihdr = pack('NNCCCCC', $width, $height, 8, 2, 0, 0, 0);
        $chunk = fn (string $type, string $data) => pack('N', strlen($data)).$type.$data.pack('N', crc32($type.$data));

        return "\x89PNG\r\n\x1a\n".$chunk('IHDR', $ihdr).$chunk('IEND', '');
    }

    /** The colour at a point of a stored avatar, as [r, g, b]. */
    protected function colourAt(string $jpeg, int $x, int $y): array
    {
        $image = imagecreatefromstring($jpeg);
        $rgb = imagecolorat($image, $x, $y);

        return [($rgb >> 16) & 0xFF, ($rgb >> 8) & 0xFF, $rgb & 0xFF];
    }

    /** The stored bytes for the one account in the test. */
    protected function storedAvatar(): string
    {
        return base64_decode((string) DB::table('user_avatars')->value('data'), true) ?: '';
    }

    /** `avatarUrl` without its host, so the test client can request it. */
    protected function relative(string $url): string
    {
        $parts = parse_url($url);

        return $parts['path'].'?'.$parts['query'];
    }
}
