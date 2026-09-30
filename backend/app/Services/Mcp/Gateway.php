<?php

namespace App\Services\Mcp;

use Mcp\Client;
use Mcp\Client\Transport\HttpTransport;
use Mcp\Schema\Content\TextContent;
use RuntimeException;

/** Small SDK boundary shared by reviewed MCP-backed connectors. */
class Gateway
{
    public function __construct(private readonly EndpointPolicy $endpoints) {}

    /** @return array{text: string, truncated: bool} */
    public function call(string $endpoint, string $tool, array $arguments): array
    {
        $client = Client::builder()->setClientInfo('Vibyra Agent Mode', '1.0.0')
            ->setInitTimeout(10)->setRequestTimeout(12)->setMaxRetries(0)->build();
        $transport = new HttpTransport(endpoint: $endpoint,
            httpClient: new PinnedHttpClient($this->endpoints));
        try {
            $client->connect($transport);
            $known = array_map(static fn ($item) => $item->name, $client->listTools()->tools);
            if (!in_array($tool, $known, true)) throw new RuntimeException('The MCP server no longer offers this tool.');
            $answer = $client->callTool($tool, $arguments);
            if ($answer->isError) throw new RuntimeException('The MCP server could not answer this call.');
            $text = implode("\n", array_map(static fn ($item) => $item instanceof TextContent ? $item->text : '',
                $answer->content));
            $length = mb_strlen($text);
            if ($length === 0) throw new RuntimeException('The MCP server returned no text.');
            return ['text' => mb_substr($text, 0, 16_000), 'truncated' => $length > 16_000];
        } finally {
            $client->disconnect();
        }
    }
}
