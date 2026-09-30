<?php
use Illuminate\Http\Request;

/** Real route + middleware + controller + services, in this process, over the shared Postgres. */
final class ConcHttp
{
    /** @return array{status: int, json: ?array} */
    public static function call(string $method, string $uri, ?string $token = null, array $json = [], array $headers = [], ?string $raw = null): array
    {
        $server = ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json', 'REMOTE_ADDR' => self::ip($headers['X-Conc-Ip'] ?? $token ?? $uri)];
        if ($token) $server['HTTP_AUTHORIZATION'] = 'Bearer '.$token;
        foreach ($headers as $k => $v) $server['HTTP_'.strtoupper(str_replace('-', '_', $k))] = $v;
        $content = $raw ?? ($method === 'GET' || $method === 'DELETE' ? null : json_encode($json));
        $kernel = app(Illuminate\Contracts\Http\Kernel::class);
        $request = Request::create($uri, $method, $method === 'GET' ? $json : [], [], [], $server, $content);
        $response = $kernel->handle($request);
        $kernel->terminate($request, $response);
        $decoded = json_decode((string) $response->getContent(), true);
        return ['status' => $response->getStatusCode(), 'json' => is_array($decoded) ? $decoded : null];
    }

    /** Throttles key on IP here; give each account its own address so fixtures do not starve each other. */
    private static function ip(string $seed): string
    {
        $h = crc32($seed);
        return '10.'.(($h >> 16) & 255).'.'.(($h >> 8) & 255).'.'.(($h & 255) ?: 1);
    }

    public static function runner(array $fx, string $method, string $suffix, array $json = []): array
    {
        return self::call($method, '/api/agents/v2/runner/'.$fx['runtime']['id'].$suffix, $fx['token'], $json,
            ['X-Vibyra-Runner-Key' => $fx['runtime']['runnerKey']]);
    }
}
