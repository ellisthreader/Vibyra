<?php
final class ConcStageSixOps
{
    public static function setup(): void { config(['agents_v2.capabilities_enabled' => true]); }
    public static function run(array $a): array
    {
        self::setup();
        return ConcHttp::call($a['method'], $a['uri'], $a['token'], $a['json'] ?? [], [], $a['method'] === 'DELETE' ? json_encode($a['json'] ?? []) : null);
    }
}
