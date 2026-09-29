<?php

namespace App\Services;

use InvalidArgumentException;

class ReleaseCapacity
{
    public function assess(float $total, float $free, int $incoming = 0): array
    {
        if ($total <= 0 || $free < 0 || $free > $total || $incoming < 0) {
            throw new InvalidArgumentException('Invalid capacity measurement.');
        }
        $remaining = $free - $incoming;
        $used = 100 * (1 - $remaining / $total);

        return ['totalBytes' => $total, 'freeBytes' => $free, 'incomingBytes' => $incoming,
            'remainingBytes' => $remaining, 'usedPercent' => round($used, 2),
            'status' => $used >= 90 ? 'critical' : ($used >= 80 ? 'warning' : 'ok'),
            'uploadAllowed' => $remaining >= max(512 * 1024 * 1024, $total * .1)];
    }
}
