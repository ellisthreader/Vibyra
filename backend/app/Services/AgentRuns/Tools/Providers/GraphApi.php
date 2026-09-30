<?php

namespace App\Services\AgentRuns\Tools\Providers;

use App\Services\ChatConnectors\Microsoft\DownloadText;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Microsoft Graph for the Agent V2 Microsoft 365 wave. Every call goes through
 * `ProviderHttp` (401/invalid_grant → reconnect, 429 + Retry-After → rate_limited,
 * write timeouts → outcome_unknown). A personal Microsoft account asked for a
 * work-only API (Teams, SharePoint) is a typed `personal_account_unsupported`
 * refusal. Paging never follows a provider URL: only `$skip`/`$skiptoken` from
 * Graph's nextLink travel back as an opaque base64url `pageToken`.
 */
final class GraphApi
{
    public const BASE = 'https://graph.microsoft.com/v1.0';
    private const PERSONAL = '/\bmsa\b|personal microsoft account|consumer account|spo license|not supported for personal/';

    public function __construct(private readonly string $name, private readonly string $slug, private readonly bool $workOnly = false) {}

    public function get(string $token, string $path, array $query = [], array $headers = []): array
    {
        return $this->json($this->call(false, fn (PendingRequest $h) => $h->withHeaders($headers)->get(self::BASE.$path, $query), $token), false);
    }

    /** A POST that only reads (e.g. getSchedule): failures are retryable, never unknown. */
    public function query(string $token, string $path, array $payload): array
    {
        return $this->json($this->call(false, fn (PendingRequest $h) => $h->asJson()->post(self::BASE.$path, $payload), $token), false);
    }

    public function post(string $token, string $path, array $payload): Response
    {
        return $this->call(true, fn (PendingRequest $h) => $h->asJson()->post(self::BASE.$path, $payload), $token);
    }

    public function json(Response $response, bool $write): array
    {
        return ProviderHttp::json($response, $this->name, $write);
    }

    private function call(bool $write, callable $send, string $token): Response
    {
        $response = ProviderHttp::send($this->name, $this->slug, $write, fn () => $send(ProviderHttp::bearer($token)), [400, 403, 404]);
        if ($response->successful()) return $response;
        $text = strtolower((string) $response->body());
        if ($this->workOnly && preg_match(self::PERSONAL, $text))
            throw ToolFailure::refused('personal_account_unsupported', $this->name.' works only with a Microsoft work or '
                .'school account. This connection is a personal Microsoft account; connect a work or school account instead.');
        // Classify the same answer again without a second request.
        return ProviderHttp::send($this->name, $this->slug, $write, fn () => $response);
    }

    /** Graph's nextLink reduced to its skip parameters, as an opaque token. */
    public static function next(array $body): ?string
    {
        $link = $body['@odata.nextLink'] ?? null;
        if (!is_string($link) || strtolower((string) parse_url($link, PHP_URL_HOST)) !== 'graph.microsoft.com') return null;
        parse_str((string) parse_url($link, PHP_URL_QUERY), $query);
        $keep = array_intersect_key($query, ['$skip' => 1, '$skiptoken' => 1]);
        return $keep === [] ? null : rtrim(strtr(base64_encode((string) json_encode($keep)), '+/', '-_'), '=');
    }

    /** The validated pageToken argument (null for the first page). */
    public static function page(array $arguments): ?string
    {
        $token = $arguments['pageToken'] ?? null;
        abort_unless($token === null || is_string($token), 422, 'That page token is invalid.');
        self::restore($token);
        return $token;
    }

    /** The $skip / $skiptoken query a pageToken stands for. */
    public static function restore(?string $token): array
    {
        if ($token === null) return [];
        $decoded = preg_match('/^[A-Za-z0-9_-]{4,2800}$/D', $token)
            ? json_decode((string) base64_decode(strtr($token, '-_', '+/'), true), true) : null;
        abort_unless(is_array($decoded) && $decoded !== [] && array_diff(array_keys($decoded), ['$skip', '$skiptoken']) === []
            && array_filter($decoded, fn ($v) => !is_string($v) || strlen($v) > 2000) === [], 422,
            'That page token is invalid. Use nextPageToken from the previous result.');
        return $decoded;
    }

    public static function paging(array $body): array
    {
        $next = self::next($body);
        return ['hasMore' => $next !== null, 'nextPageToken' => $next,
            'coverage' => $next !== null ? 'Partial: pass nextPageToken to continue.' : 'Complete.'];
    }

    /** An exact Graph resource id (messages, events, drive items, teams, channels, sites). */
    public static function id(mixed $id, string $message, string $pattern = '/^[A-Za-z0-9_+\/=.,!:@-]{2,500}$/D'): string
    {
        abort_unless(is_string($id) && preg_match($pattern, $id), 422, $message);
        return $id;
    }

    public static function search(mixed $value, int $max, string $message): string
    {
        return str_replace(['"', '\\'], '', Schema::line($value, $max, $message));
    }

    public static function plain(array $body): string
    {
        $content = (string) ($body['content'] ?? '');
        return strtolower((string) ($body['contentType'] ?? '')) === 'html'
            ? trim(html_entity_decode(strip_tags($content), ENT_QUOTES | ENT_HTML5, 'UTF-8')) : $content;
    }

    /** Read a drive item's text through the signed download URL (never with the Graph bearer). */
    public function text(array $item): array
    {
        if (isset($item['folder'])) throw ToolFailure::refused('unsupported', 'That is a folder, not a file.');
        try { return app(DownloadText::class)->fetch($item); }
        catch (HttpException $e) { throw ToolFailure::refused('unsupported', $e->getMessage()); }
        catch (\Illuminate\Http\Client\ConnectionException) { throw ToolFailure::retryable($this->name.' did not return the file in time.'); }
    }

    public static function file(array $f): array
    {
        return ['id' => $f['id'] ?? null, 'name' => $f['name'] ?? null, 'size' => $f['size'] ?? null,
            'mimeType' => $f['file']['mimeType'] ?? null, 'folder' => isset($f['folder']),
            'modifiedAt' => $f['lastModifiedDateTime'] ?? null, 'url' => $f['webUrl'] ?? null];
    }
}
