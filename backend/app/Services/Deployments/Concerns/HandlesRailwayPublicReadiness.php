<?php

namespace App\Services\Deployments\Concerns;

use App\Models\PublishedProjectDeployment;
use App\Services\Deployments\DeploymentArtifactStore;
use Illuminate\Support\Facades\Http;
use Throwable;

trait HandlesRailwayPublicReadiness
{
    private function waitForPublicDemoUrl(string $url, PublishedProjectDeployment $deployment): bool
    {
        if (is_callable($this->runner)) {
            return true;
        }
        $expectsFrontend = $this->bundleContainsFrontend($deployment);
        $deadline = time() + max(5, (int) config('services.railway.runtime_ready_timeout', 180));
        do {
            if ($this->publicDemoUrlReady($url, $expectsFrontend)) {
                return true;
            }
            sleep(min(8, max(1, $deadline - time())));
        } while (time() < $deadline);

        return $this->publicDemoUrlReady($url, $expectsFrontend);
    }

    private function publicDemoUrlReady(string $url, bool $expectsFrontend = false): bool
    {
        try {
            $response = Http::timeout(8)->get($url);
        } catch (Throwable) {
            return false;
        }
        if ($response->status() < 200
            || $response->status() >= 400
            || $this->hasInsecureSameHostAssets($response->body(), (string) $response->header('Link'), $url)) {
            return false;
        }
        $isHtml = str_contains(strtolower((string) $response->header('Content-Type')), 'text/html')
            || str_contains(strtolower($response->body()), '<html')
            || str_contains(strtolower($response->body()), '<!doctype html');
        if ($expectsFrontend && ! $isHtml) {
            return false;
        }

        return $this->sameHostFrontendAssetsReady(
            $response->body(),
            (string) $response->header('Link'),
            $url,
        );
    }

    private function bundleContainsFrontend(PublishedProjectDeployment $deployment): bool
    {
        $frontendDirectory = trim((string) data_get($deployment->metadata, 'frontendDistDirectory', ''), '/');
        foreach (app(DeploymentArtifactStore::class)->files($deployment) as $file) {
            $path = (string) data_get($file, 'path', '');
            if (str_starts_with($path, 'public/build/')
                || ($frontendDirectory !== '' && $path === $frontendDirectory.'/index.html')) {
                return true;
            }
        }

        return false;
    }

    private function sameHostFrontendAssetsReady(string $body, string $linkHeader, string $publicUrl): bool
    {
        if (! str_contains(strtolower($body), '<html')
            && ! str_contains(strtolower($body), '<!doctype html')) {
            return true;
        }
        preg_match_all('/\b(?:src|href)\s*=\s*["\']([^"\']+)["\']/i', $body, $htmlMatches);
        preg_match_all('/<([^>]+)>/', $linkHeader, $linkMatches);
        $references = array_values(array_unique([
            ...($htmlMatches[1] ?? []),
            ...($linkMatches[1] ?? []),
        ]));
        $assets = [];
        foreach ($references as $reference) {
            $assetUrl = $this->sameHostAssetUrl((string) $reference, $publicUrl);
            if ($assetUrl !== null && preg_match('/\.(?:css|m?js)(?:[?#]|$)/i', $assetUrl) === 1) {
                $assets[] = $assetUrl;
            }
        }
        foreach (array_slice(array_values(array_unique($assets)), 0, 20) as $assetUrl) {
            try {
                $asset = Http::timeout(8)->get($assetUrl);
            } catch (Throwable) {
                return false;
            }
            if ($asset->status() < 200 || $asset->status() >= 400) {
                return false;
            }
            if (str_contains(strtolower((string) $asset->header('Content-Type')), 'text/html')) {
                return false;
            }
        }

        return true;
    }

    private function sameHostAssetUrl(string $reference, string $publicUrl): ?string
    {
        $reference = html_entity_decode(trim($reference), ENT_QUOTES | ENT_HTML5);
        if ($reference === '' || str_starts_with($reference, '#') || str_starts_with($reference, 'data:')) {
            return null;
        }
        $scheme = strtolower((string) parse_url($publicUrl, PHP_URL_SCHEME));
        $host = strtolower((string) parse_url($publicUrl, PHP_URL_HOST));
        if ($scheme !== 'https' || $host === '') {
            return null;
        }
        if (str_starts_with($reference, '//')) {
            $reference = 'https:'.$reference;
        }
        if (filter_var($reference, FILTER_VALIDATE_URL) !== false) {
            return strtolower((string) parse_url($reference, PHP_URL_HOST)) === $host ? $reference : null;
        }
        $path = str_starts_with($reference, '/')
            ? $reference
            : rtrim((string) parse_url($publicUrl, PHP_URL_PATH), '/').'/'.$reference;

        return 'https://'.$host.'/'.ltrim($path, '/');
    }

    private function hasInsecureSameHostAssets(string $body, string $linkHeader, string $publicUrl): bool
    {
        $host = strtolower((string) parse_url($publicUrl, PHP_URL_HOST));
        if ($host === '') {
            return false;
        }
        $sameHostHttpUrl = '~http://'.preg_quote($host, '~').'(?::\d+)?(?:[/\s"\'<>;,]|$)~i';

        return preg_match($sameHostHttpUrl, $body) === 1
            || preg_match($sameHostHttpUrl, $linkHeader) === 1
            || str_contains($body, '${RAILWAY_PUBLIC_DOMAIN}')
            || str_contains($linkHeader, '${RAILWAY_PUBLIC_DOMAIN}');
    }
}
