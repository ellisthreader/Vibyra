<?php

namespace Tests\Feature;

use App\Services\AgentRuns\Guard\{SecretGuard, SensitivePaths};
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Part 16: the secret guard against the shared corpus (docs/secret-guard-vectors.json). The Rust twin in vibyra-core runs the
 * same file, so a change to either implementation that moves a vector fails both suites.
 */
class AgentDepthSecretVectorsTest extends TestCase
{
    private static function corpus(): array
    {
        return json_decode((string) file_get_contents(__DIR__.'/../../../docs/secret-guard-vectors.json'), true, 512, JSON_THROW_ON_ERROR);
    }

    public static function redactions(): array
    {
        return array_map(fn ($v) => [$v], self::corpus()['redact']);
    }

    public static function clean(): array
    {
        return array_map(fn ($v) => [$v], self::corpus()['clean']);
    }

    public static function structured(): array
    {
        return array_map(fn ($v) => [$v], self::corpus()['json']);
    }

    #[DataProvider('redactions')]
    public function test_a_secret_is_masked_named_and_never_partly_kept(array $v): void
    {
        $this->assertSame($v['output'], SecretGuard::redact($v['input']), $v['name']);
        $this->assertSame($v['kinds'], SecretGuard::scan($v['input']), $v['name']);
        $this->assertSame($v['output'], SecretGuard::redact($v['output']), 'Masking twice changes nothing: '.$v['name']);
    }

    #[DataProvider('clean')]
    public function test_ordinary_text_is_left_alone(array $v): void
    {
        $this->assertSame($v['input'], SecretGuard::redact($v['input']), $v['name']);
        $this->assertSame([], SecretGuard::scan($v['input']), $v['name']);
    }

    #[DataProvider('structured')]
    public function test_structured_values_are_masked_by_key_and_by_content(array $v): void
    {
        $this->assertSame($v['output'], SecretGuard::redactValue($v['input']), $v['name']);
        $this->assertSame($v['kinds'], SecretGuard::kindsIn($v['input']), $v['name']);
    }

    public function test_file_names_that_hold_secrets_are_refused_and_their_look_alikes_are_not(): void
    {
        $paths = self::corpus()['paths'];
        foreach ($paths['sensitive'] as $path) $this->assertTrue(SensitivePaths::sensitive($path), $path);
        foreach ($paths['allowed'] as $path) $this->assertFalse(SensitivePaths::sensitive($path), $path);
    }

    public function test_the_whole_secret_goes_even_when_the_text_is_huge(): void
    {
        $text = str_repeat('a ', 600000).'AKIAJ3Q7ZB5N2XWV4LTR';
        $out = SecretGuard::redact($text);
        $this->assertStringEndsWith('[redacted:truncated]', $out);
        $this->assertStringNotContainsString('AKIA', $out);
    }
}
