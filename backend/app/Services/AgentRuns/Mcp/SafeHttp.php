<?php

namespace App\Services\AgentRuns\Mcp;

use App\Services\Mcp\EndpointPolicy;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use InvalidArgumentException;
use Psr\Http\Message\ResponseInterface;

/**
 * Every request to a person-supplied address (MCP endpoint, OAuth metadata,
 * registration, token) goes through here. Before each hop the host is resolved and
 * every address must be public (no private, loopback, link-local, CGNAT or cloud
 * metadata ranges), HTTPS on 443 only; curl is then pinned to the checked address
 * so DNS cannot change between check and connect. Redirects are never followed by
 * the client: GETs may follow a few, each re-checked; anything else refuses them.
 * Answers are capped in time and size.
 */
final class SafeHttp
{
    public function __construct(private readonly EndpointPolicy $policy) {}

    /** @param array{headers?: array, json?: array, form?: array, query?: array, raw?: string} $options */
    public function send(string $method, string $url, array $options = [], bool $follow = false): Response
    {
        $max = (int) config('agents_v2_mcp.max_response_bytes', 1_000_000);
        for ($hop = 0; ; $hop++) {
            $response = $this->once($method, $url, $options, $max);
            if ($response->status() < 300 || $response->status() >= 400) break;
            $next = $this->location($url, (string) $response->header('Location'));
            if (!$follow || strtoupper($method) !== 'GET' || $next === null || $hop >= (int) config('agents_v2_mcp.max_redirects', 3))
                throw new McpError('redirect_blocked', 'The server redirected somewhere this connection does not follow.');
            $url = $next;
        }
        if (strlen($response->body()) > $max) throw new McpError('too_large', 'The server answered with more data than allowed.');
        return $response;
    }

    /** Validate an address without sending anything (used when a server is added). */
    public function check(string $url): void
    {
        try { $this->policy->pin($url); }
        catch (InvalidArgumentException $e) { throw new McpError('blocked_destination', $e->getMessage()); }
    }

    private function once(string $method, string $url, array $options, int $max): Response
    {
        try { $pin = $this->policy->pin($url); }
        catch (InvalidArgumentException $e) { throw new McpError('blocked_destination', $e->getMessage()); }
        $address = filter_var($pin['address'], FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) ? '['.$pin['address'].']' : $pin['address'];
        $cap = static function (...$progress) use ($max): void {
            if (($progress[1] ?? 0) > $max) throw new McpError('too_large', 'The server answered with more data than allowed.');
        };
        $request = Http::withHeaders($options['headers'] ?? [])->timeout((int) config('agents_v2_mcp.timeout_seconds', 12))
            ->connectTimeout((int) config('agents_v2_mcp.connect_timeout_seconds', 5))->withOptions([
                'allow_redirects' => false, 'verify' => true, 'progress' => $cap,
                'curl' => [CURLOPT_RESOLVE => [$pin['host'].':443:'.$address], CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
                    CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS],
                'on_headers' => static function (ResponseInterface $r) use ($max): void {
                    if ((int) $r->getHeaderLine('Content-Length') > $max) throw new McpError('too_large', 'The server answer is too large.');
                }]);
        if (isset($options['raw'])) $request = $request->withBody($options['raw'], 'application/json'); // exact bytes, e.g. a signed webhook
        $body = [];
        if (isset($options['json'])) $body['json'] = $options['json'];
        if (isset($options['form'])) [$request, $body['form_params']] = [$request->asForm(), $options['form']];
        if (isset($options['query'])) $body['query'] = $options['query'];
        try {
            return $request->send(strtoupper($method), $url, $body);
        } catch (ConnectionException $e) {
            $previous = $e->getPrevious();
            if ($previous instanceof McpError) throw $previous;
            throw new McpError('unreachable', 'The server did not respond in time.');
        }
    }

    /** An absolute https URL or a path on the same origin; anything else is not followed. */
    private function location(string $from, string $location): ?string
    {
        if ($location === '') return null;
        if (str_starts_with($location, 'https://')) return $location;
        if (!str_starts_with($location, '/') || str_starts_with($location, '//')) return null;
        $parts = parse_url($from);
        return 'https://'.$parts['host'].$location;
    }
}
