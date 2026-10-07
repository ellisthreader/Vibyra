<?php
namespace App\Services\CloudWorkspaces;

use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * A Fly resource Vibyra cannot prove is its own, or two project disks it cannot explain: retrying will not fix it, so a
 * start stops at once (stop_reason provider_review) instead of running to boot_timeout. Still a 503 for every caller.
 */
final class ProviderReview extends HttpException
{
    public function __construct(string $message) { parent::__construct(503, $message); }

    public static function unless(bool $ok, string $message): void
    {
        if (!$ok) throw new self($message);
    }
}
