<?php
use Illuminate\Support\Facades\{DB, Http};

/**
 * Provider stand-ins for the harness, all answered inside each process and recorded in `conc_calls` like every other call:
 * Gmail's Message-ID lookup (finds exactly the sends that reached the fake), a minimal remote MCP server, and GitHub's Git
 * Data API with a branch that exists once a ref was created (so a duplicate publish is visible as a second ref write).
 */
final class ConcProviders
{
    public const BASE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    public const MCP = 'https://mcp.conc.example/mcp';

    /** Gmail `in:sent rfc822msgid:<id>`: a hit only when a send carrying that Message-ID reached the fake provider. */
    public static function gmailLookup($request)
    {
        $token = substr((string) ($request->header('Authorization')[0] ?? ''), 7);
        preg_match('/rfc822msgid:(<[^>\s]+>)/', (string) ($request->data()['q'] ?? ''), $m);
        DB::table('conc_calls')->insert(['kind' => 'GMAIL_LOOKUP', 'ckey' => $token, 'pid' => getmypid(), 'ended_at' => DB::raw('clock_timestamp()')]);
        $hit = isset($m[1]) ? DB::table('conc_calls')->where('kind', 'GMAIL_SEND')->where('ckey', $token)->where('note', 'like', '%'.$m[1].'%')->first() : null;
        return Http::response(['messages' => $hit ? [['id' => 'sent-'.$hit->id, 'threadId' => 't-sent']] : []]);
    }

    public static function mcp($request)
    {
        if ($request->method() === 'DELETE') return Http::response('', 200);
        $body = json_decode($request->body(), true);
        if (!isset($body['id'])) return Http::response('', 202);
        $result = match ($body['method'] ?? '') {
            'initialize' => ['protocolVersion' => '2025-06-18', 'capabilities' => ['tools' => (object) []], 'serverInfo' => ['name' => 'Docs', 'version' => '1']],
            'tools/list' => ['tools' => [['name' => 'search_docs', 'description' => 'Search the docs.', 'inputSchema' => ['type' => 'object',
                'properties' => ['query' => ['type' => 'string']], 'required' => ['query']], 'annotations' => ['readOnlyHint' => true]]]],
            default => null,
        };
        $message = $result === null ? ['jsonrpc' => '2.0', 'id' => $body['id'], 'error' => ['code' => -32601, 'message' => 'no']]
            : ['jsonrpc' => '2.0', 'id' => $body['id'], 'result' => $result];
        return Http::response($message, 200, ['Content-Type' => 'application/json', 'Mcp-Session-Id' => 'sess-1']);
    }

    /** api.github.com/repos/octo/app/git/*: enough of the Git Data API for one `Publisher::publish` (create branch). */
    public static function github($request)
    {
        $path = (string) parse_url($request->url(), PHP_URL_PATH);
        $data = $request->data();
        $ref = fn (string $name, string $sha) => ['ref' => $name, 'object' => ['type' => 'commit', 'sha' => $sha]];
        if ($request->method() === 'GET' && str_ends_with($path, '/git/ref/heads/main')) return Http::response($ref('refs/heads/main', self::BASE));
        if ($request->method() === 'GET' && str_contains($path, '/git/ref/heads/vibyra-agent/')) {
            $name = 'refs/heads/'.substr($path, strpos($path, 'vibyra-agent/'));
            $made = DB::table('conc_calls')->where('kind', 'GITHUB_REF_CREATE')->where('ckey', $name)->first();
            return $made ? Http::response($ref($name, (string) $made->note)) : Http::response(['message' => 'Not Found'], 404);
        }
        if ($request->method() === 'GET' && str_contains($path, '/git/commits/'))
            return Http::response(['sha' => basename($path), 'tree' => ['sha' => str_repeat('0', 39).(basename($path) === self::BASE ? '0' : '1')]]);
        if (str_ends_with($path, '/git/blobs')) {
            $content = base64_decode((string) $data['content']);
            return Http::response(['sha' => sha1('blob '.strlen($content)."\0".$content)], 201);
        }
        if (str_ends_with($path, '/git/trees')) return Http::response(['sha' => str_repeat('e', 40)], 201);
        if (str_ends_with($path, '/git/commits'))
            return Http::response(['sha' => str_repeat('c', 40), 'tree' => ['sha' => $data['tree']], 'parents' => [['sha' => $data['parents'][0]]], 'message' => $data['message']], 201);
        if ($request->method() === 'POST' && str_ends_with($path, '/git/refs')) {
            $id = (int) DB::table('conc_calls')->insertGetId(['kind' => 'GITHUB_REF_CREATE', 'ckey' => $data['ref'], 'note' => $data['sha'], 'pid' => getmypid()]);
            usleep(((int) getenv('CONC_PUBLISH_DELAY_MS')) * 1000);
            DB::table('conc_calls')->where('id', $id)->update(['ended_at' => DB::raw('clock_timestamp()')]);
            return Http::response($ref($data['ref'], $data['sha']), 201);
        }
        return null;
    }
}
