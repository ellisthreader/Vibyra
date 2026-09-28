<?php

namespace App\Services\Account;

use GdImage;

/**
 * Turns an uploaded photo into the one shape an avatar is ever stored in: a
 * centre-cropped 512x512 JPEG. Re-encoding through GD is also what removes the
 * photo's metadata — EXIF, including GPS, never survives it — so nothing about
 * where a picture was taken reaches another request.
 *
 * Everything is checked from the file header before a pixel is decoded, because
 * a small file can declare a huge canvas and decoding it is what costs memory.
 */
final class AvatarImage
{
    public const SIZE = 512;
    public const MAX_BYTES = 5 * 1024 * 1024;
    public const MAX_PIXELS = 40_000_000;
    public const TYPE_ERROR = 'Choose a JPEG, PNG or WebP photo under 5 MB.';

    private const READERS = [
        IMAGETYPE_JPEG => 'imagecreatefromjpeg',
        IMAGETYPE_PNG => 'imagecreatefrompng',
        IMAGETYPE_WEBP => 'imagecreatefromwebp',
    ];

    /** @return array{bytes: string, sha256: string, width: int, height: int} */
    public function fromFile(string $path): array
    {
        if (! function_exists('imagecreatetruecolor') || ! function_exists('imagejpeg')) {
            throw new AvatarRejected('Photo uploads are not available right now.', 503);
        }
        $info = @getimagesize($path);
        $type = is_array($info) ? $info[2] : 0;
        $reader = self::READERS[$type] ?? null;
        if ($reader === null) {
            throw new AvatarRejected(self::TYPE_ERROR);
        }
        if (! function_exists($reader)) {
            throw new AvatarRejected('WebP photos cannot be read here yet. Choose a JPEG or PNG.');
        }
        [$width, $height] = $info;
        if ($width < 1 || $height < 1) {
            throw new AvatarRejected('That photo could not be read. Choose a different one.');
        }
        if ($width * $height > self::MAX_PIXELS) {
            throw new AvatarRejected('That photo is too large. Choose one under 40 megapixels.');
        }
        $this->reserveMemory($width * $height);

        $source = @$reader($path);
        if (! $source instanceof GdImage) {
            throw new AvatarRejected('That photo could not be read. Choose a different one.');
        }
        if ($type === IMAGETYPE_JPEG) {
            $source = $this->upright($source, $path);
        }
        $bytes = $this->square($source);

        return ['bytes' => $bytes, 'sha256' => hash('sha256', $bytes), 'width' => self::SIZE, 'height' => self::SIZE];
    }

    /** Centre crop, resample to SIZE and encode. Transparency lands on white, as JPEG has none. */
    private function square(GdImage $source): string
    {
        $width = imagesx($source);
        $height = imagesy($source);
        $side = min($width, $height);
        $canvas = imagecreatetruecolor(self::SIZE, self::SIZE);
        imagefill($canvas, 0, 0, imagecolorallocate($canvas, 255, 255, 255));
        imagecopyresampled(
            $canvas, $source, 0, 0,
            intdiv($width - $side, 2), intdiv($height - $side, 2),
            self::SIZE, self::SIZE, $side, $side,
        );
        ob_start();
        imagejpeg($canvas, null, 82);

        return (string) ob_get_clean();
    }

    /**
     * A camera JPEG stores its pixels sideways and says so in EXIF. Stripping the
     * metadata without applying it would store the photo on its side.
     */
    private function upright(GdImage $image, string $path): GdImage
    {
        if (! function_exists('exif_read_data')) {
            return $image;
        }
        $orientation = (int) ((@exif_read_data($path) ?: [])['Orientation'] ?? 1);
        if (in_array($orientation, [2, 5, 7], true)) {
            imageflip($image, IMG_FLIP_HORIZONTAL);
        }
        if ($orientation === 4) {
            imageflip($image, IMG_FLIP_VERTICAL);
        }
        $angle = match ($orientation) { 3 => 180, 5, 8 => 90, 6, 7 => -90, default => 0 };

        return $angle === 0 ? $image : (imagerotate($image, $angle, 0) ?: $image);
    }

    /**
     * A decoded canvas costs about four bytes a pixel, and turning a sideways camera
     * JPEG upright holds a second copy, so a 12 MP phone photo can need ~100 MB on
     * top of the request. Raise the limit for this request only (PHP restores it
     * when the request ends), or refuse rather than let PHP die half way through.
     */
    private function reserveMemory(int $pixels): void
    {
        $limit = $this->bytes((string) ini_get('memory_limit'));
        $needed = memory_get_usage() + $pixels * 9 + 32 * 1024 * 1024;
        if ($limit < 0 || $needed <= $limit) {
            return;
        }
        if (@ini_set('memory_limit', (string) $needed) === false) {
            throw new AvatarRejected('That photo is too large. Choose a smaller one.');
        }
    }

    private function bytes(string $value): int
    {
        $value = trim($value);
        if ($value === '' || $value === '-1') {
            return -1;
        }
        $number = (int) $value;

        return match (strtolower(substr($value, -1))) {
            'g' => $number * 1024 ** 3, 'm' => $number * 1024 ** 2, 'k' => $number * 1024, default => $number,
        };
    }
}
