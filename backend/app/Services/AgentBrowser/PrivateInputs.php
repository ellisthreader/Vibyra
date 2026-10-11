<?php
namespace App\Services\AgentBrowser;

/** Only native input operations, never JavaScript, selectors, URLs, files or arbitrary CDP commands. */
final class PrivateInputs
{
    public static function validate(array $d, array $frame): array
    {
        $kind = $d['kind'] ?? '';
        $fields = match ($kind) {
            'click' => ['kind', 'x', 'y'], 'scroll' => ['kind', 'x', 'y', 'deltaY'],
            'text' => ['kind', 'text'], 'key' => ['kind', 'key'], 'resume', 'close' => ['kind'], default => [],
        };
        abort_unless($fields && array_diff(array_keys($d), $fields) === [], 422, 'Unsupported private browser input.');
        foreach ($fields as $key) abort_unless(array_key_exists($key, $d), 422, 'Incomplete private browser input.');
        if (in_array($kind, ['click', 'scroll'], true)) {
            foreach (['x' => 'width', 'y' => 'height'] as $key => $dimension)
                abort_unless(is_int($d[$key]) && $d[$key] >= 0 && $d[$key] < ($frame[$dimension] ?? 0), 422, 'Input is outside the private browser frame.');
        }
        if ($kind === 'scroll') abort_unless(is_int($d['deltaY']) && abs($d['deltaY']) <= 1000, 422);
        if ($kind === 'text') abort_unless(is_string($d['text']) && strlen($d['text']) > 0 && strlen($d['text']) <= 2000
            && !str_contains($d['text'], "\0"), 422);
        if ($kind === 'key') abort_unless(in_array($d['key'], ['Enter', 'Tab', 'Backspace', 'Delete', 'Escape',
            'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'SelectAll'], true), 422);
        return $d;
    }

    public static function frame(array $frame): array
    {
        abort_unless(array_diff(array_keys($frame), ['image', 'width', 'height']) === []
            && is_string($frame['image'] ?? null) && strlen($frame['image']) <= 1400000
            && ($frame['width'] ?? null) === 1280 && ($frame['height'] ?? null) === 800, 422, 'Invalid private browser frame.');
        $bytes = base64_decode($frame['image'], true);
        $size = is_string($bytes) && strlen($bytes) <= 1048576 ? @getimagesizefromstring($bytes) : false;
        abort_unless($size && $size[0] === 1280 && $size[1] === 800 && $size[2] === IMAGETYPE_JPEG, 422, 'Invalid private browser image.');
        return $frame;
    }
}
