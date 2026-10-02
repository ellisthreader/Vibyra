<?php
namespace App\Services\Assistant;

final class Failure
{
    public static function raise(int $status, string $code, string $message): never
    {
        abort(response()->json(['ok' => false, 'code' => $code, 'error' => $message], $status)
            ->header('Cache-Control', 'private, no-store'));
    }

    public static function upstream(): never
    {
        self::raise(502, 'assistant_upstream', 'Vibyra could not complete this request. Please try again shortly.');
    }
}
