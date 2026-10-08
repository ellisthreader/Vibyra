<?php
namespace App\Services\AgentWork\Signals;
use Carbon\CarbonImmutable;
final class Times
{
    public static function iso(mixed $value): ?string
    { return $value===null?null:CarbonImmutable::parse($value,'UTC')->toIso8601String(); }
}
