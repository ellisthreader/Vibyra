<?php

namespace Tests\Feature;

use App\Http\Controllers\VibyraDesktopController;
use Tests\TestCase;

class LegacyDesktopRoutesTest extends TestCase
{
    public function createApplication()
    {
        $originalEnvironment = $this->captureEnvironment([
            'APP_ENV',
            'VIBYRA_LEGACY_DESKTOP_ROUTES_ENABLED',
        ]);

        try {
            if ($this->name() === 'test_production_disables_legacy_desktop_routes_by_default') {
                $this->setEnvironment('APP_ENV', 'production');
                $this->setEnvironment('VIBYRA_LEGACY_DESKTOP_ROUTES_ENABLED');
            } elseif ($this->name() === 'test_production_can_enable_legacy_desktop_routes_explicitly') {
                $this->setEnvironment('APP_ENV', 'production');
                $this->setEnvironment('VIBYRA_LEGACY_DESKTOP_ROUTES_ENABLED', 'true');
            } else {
                $this->setEnvironment('APP_ENV', 'testing');
                $this->setEnvironment('VIBYRA_LEGACY_DESKTOP_ROUTES_ENABLED');
            }

            return parent::createApplication();
        } finally {
            $this->restoreEnvironment($originalEnvironment);
        }
    }

    public function test_production_disables_legacy_desktop_routes_by_default(): void
    {
        $this->get('/desktop')->assertNotFound();
        $this->get('/health')->assertNotFound();
        $this->postJson('/pair')->assertNotFound();
        $this->assertSame([], $this->legacyDesktopRoutes());

        $this->get('/up')->assertOk();
        $this->getJson('/api/billing/plans')
            ->assertOk()
            ->assertJsonPath('ok', true);
    }

    public function test_testing_enables_legacy_desktop_routes_by_default(): void
    {
        $this->get('/desktop')->assertOk();
        $this->getJson('/health')
            ->assertOk()
            ->assertJsonPath('ok', true);
        $this->assertContains('OPTIONS {any}', $this->legacyDesktopRoutes());
    }

    public function test_production_can_enable_legacy_desktop_routes_explicitly(): void
    {
        $this->get('/desktop')->assertOk();
        $this->getJson('/health')
            ->assertOk()
            ->assertJsonPath('ok', true);
        $this->assertContains('OPTIONS {any}', $this->legacyDesktopRoutes());
    }

    /**
     * @return list<string>
     */
    private function legacyDesktopRoutes(): array
    {
        return collect($this->app['router']->getRoutes()->getRoutes())
            ->filter(fn ($route) => str_starts_with(
                $route->getActionName(),
                VibyraDesktopController::class.'@',
            ))
            ->map(fn ($route) => implode('|', $route->methods()).' '.$route->uri())
            ->values()
            ->all();
    }

    private function setEnvironment(string $key, ?string $value = null): void
    {
        if ($value === null) {
            putenv($key);
            unset($_ENV[$key], $_SERVER[$key]);

            return;
        }

        putenv("{$key}={$value}");
        $_ENV[$key] = $value;
        $_SERVER[$key] = $value;
    }

    /**
     * @param  list<string>  $keys
     * @return array<string, array{process: string|false, env: mixed, env_exists: bool, server: mixed, server_exists: bool}>
     */
    private function captureEnvironment(array $keys): array
    {
        $environment = [];

        foreach ($keys as $key) {
            $environment[$key] = [
                'process' => getenv($key),
                'env' => $_ENV[$key] ?? null,
                'env_exists' => array_key_exists($key, $_ENV),
                'server' => $_SERVER[$key] ?? null,
                'server_exists' => array_key_exists($key, $_SERVER),
            ];
        }

        return $environment;
    }

    /**
     * @param  array<string, array{process: string|false, env: mixed, env_exists: bool, server: mixed, server_exists: bool}>  $environment
     */
    private function restoreEnvironment(array $environment): void
    {
        foreach ($environment as $key => $values) {
            $values['process'] === false
                ? putenv($key)
                : putenv("{$key}={$values['process']}");

            if ($values['env_exists']) {
                $_ENV[$key] = $values['env'];
            } else {
                unset($_ENV[$key]);
            }

            if ($values['server_exists']) {
                $_SERVER[$key] = $values['server'];
            } else {
                unset($_SERVER[$key]);
            }
        }
    }
}
