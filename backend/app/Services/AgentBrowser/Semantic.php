<?php
namespace App\Services\AgentBrowser;
use App\Services\AgentRuns\Browser\BrowserOrigins;
use App\Services\AgentRuns\SafeUrl;
use App\Services\AgentRuns\Tools\Providers\Schema;
final class Semantic
{
    public const FIELDS = ['origin', 'path', 'role', 'name', 'inputType', 'href'];
    public static function validate(array $args): array
    {
        Schema::only($args, self::FIELDS);
        foreach (['origin', 'path', 'role', 'name'] as $key) abort_unless(is_string($args[$key] ?? null), 422, 'Use a complete semantic target.');
        $origin = BrowserOrigins::ofUrl($args['origin']);
        abort_unless($origin === $args['origin'] && self::page($origin.$args['path'])
            && str_starts_with($args['path'], '/') && strlen($args['path']) <= 500, 422, 'Use an exact ordinary page origin and path.');
        abort_unless(in_array($args['role'], ['link','button','textbox','combobox','checkbox','radio','tab','menuitem'], true), 422, 'Use a supported element role.');
        $name = Schema::line($args['name'], 120, 'Name the exact visible target.');
        abort_if(preg_match('/pass|secret|token|one.?time|captcha|otp|verification|security.?code|recovery|private.?key|seed.?phrase|card.?num|cvv|cvc|social.?sec|iban|2fa|mfa/i', $name), 422, 'Private fields cannot be taught.');
        if (isset($args['inputType'])) abort_unless(in_array($args['inputType'], ['input','text','email','search','url','tel','number','textarea','select','checkbox','radio','button','submit'], true), 422, 'Private or unsupported input type.');
        if (isset($args['href'])) abort_unless(is_string($args['href']) && self::page($args['href']), 422, 'Use an ordinary nonprivate link.');
        return $args;
    }
    private static function page(string $url): bool
    {
        $parts = parse_url($url);
        return BrowserOrigins::ofUrl($url) !== null && is_array($parts)
            && !isset($parts['query']) && !isset($parts['fragment'])
            && !str_contains($parts['path'] ?? '/', '%') && SafeUrl::page($url) === $url;
    }
}
