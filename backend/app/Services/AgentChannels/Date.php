<?php
namespace App\Services\AgentChannels;
use Carbon\CarbonImmutable;
final class Date
{
    public static function parse(string $value): CarbonImmutable
    {
        $pattern='/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-](\d{2}):(\d{2}))$/D';
        abort_unless(preg_match($pattern,$value,$m)&&checkdate((int)$m[2],(int)$m[3],(int)$m[1])
            &&(int)$m[4]<24&&(int)$m[5]<60&&(int)$m[6]<60&&(int)($m[8]??0)<=14&&(int)($m[9]??0)<60
            &&((int)($m[8]??0)<14||(int)($m[9]??0)===0),422,'Use a real ISO8601 time with seconds and timezone.');
        return CarbonImmutable::parse($value)->utc();
    }
}
