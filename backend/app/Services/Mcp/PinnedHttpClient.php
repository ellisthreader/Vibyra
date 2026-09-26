<?php

namespace App\Services\Mcp;

use GuzzleHttp\Client;
use GuzzleHttp\Handler\CurlHandler;
use Psr\Http\Client\ClientInterface;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;
use RuntimeException;

/** PSR-18 transport that pins DNS after public-address validation. */
final class PinnedHttpClient implements ClientInterface
{
    private const MAX_RESPONSE_BYTES = 2_000_000;

    public function __construct(private readonly EndpointPolicy $endpoints) {}

    public function sendRequest(RequestInterface $request): ResponseInterface
    {
        $pin = $this->endpoints->pin((string) $request->getUri());
        $address = filter_var($pin['address'], FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)
            ? '['.$pin['address'].']' : $pin['address'];
        $client = new Client([
            'handler' => new CurlHandler(),
            'curl' => [CURLOPT_RESOLVE => [$pin['host'].':443:'.$address],
                CURLOPT_PROTOCOLS => CURLPROTO_HTTPS],
            'allow_redirects' => false,
            'connect_timeout' => 5,
            'timeout' => 12,
            'verify' => true,
            'http_errors' => false,
            'on_headers' => static function (ResponseInterface $response): void {
                if ((int) $response->getHeaderLine('Content-Length') > self::MAX_RESPONSE_BYTES) {
                    throw new RuntimeException('The MCP response is too large.');
                }
            },
            'progress' => static function ($total, $downloaded, $uploadTotal, $uploaded): void {
                if ($downloaded > self::MAX_RESPONSE_BYTES) {
                    throw new RuntimeException('The MCP response is too large.');
                }
            },
        ]);
        $response = $client->sendRequest($request);
        if ($response->getStatusCode() >= 300 && $response->getStatusCode() < 400) {
            throw new RuntimeException('The MCP server redirected to another address.');
        }
        return $response;
    }
}
