<?php
use Illuminate\Support\Facades\{DB, Http};
require_once __DIR__.'/FakeProviders.php';
require_once __DIR__.'/KillPoints.php';

/**
 * Outbound HTTP for the harness. Every call lands in `conc_calls` (a harness-only table made by
 * setup(), never a migration) with DB-side clock timestamps, so counts and overlaps are read
 * from the database that all processes share. Anything unknown is recorded as STRAY.
 */
final class ConcFakes
{
    public static function setup(): void
    {
        DB::statement('DROP TABLE IF EXISTS conc_calls');
        DB::statement('CREATE TABLE conc_calls (id bigserial PRIMARY KEY, kind text NOT NULL, ckey text, pid int, '
            .'started_at timestamptz DEFAULT clock_timestamp(), ended_at timestamptz, note text)');
    }

    public static function install(): void
    {
        ConcKill::install(); // inert unless the scenario armed a kill point for this process
        // Remote MCP addresses resolve through this table instead of DNS: only the harness's own server is public.
        app()->instance(\App\Services\Mcp\EndpointPolicy::class, new \App\Services\Mcp\EndpointPolicy(fn (string $host) => in_array($host, ['mcp.conc.example', 'hooks.conc.example'], true) ? ['93.184.216.34'] : []));
        Http::fake(function ($request) {
            $url = $request->url();
            if ($url === 'https://oauth2.googleapis.com/token') {
                self::record('GOOGLE_REFRESH', (string) $request['refresh_token'], null, 150);
                return Http::response(['access_token' => 'refreshed-'.$request['refresh_token'], 'expires_in' => 3600]);
            }
            if (str_starts_with($url, ConcProviders::MCP)) return ConcProviders::mcp($request);
            if (str_contains($url, 'api.github.com/repos/octo/app/') && ($answer = ConcProviders::github($request))) return $answer;
            if (str_contains($url, 'gmail.googleapis.com') && $request->method() === 'GET' && str_contains((string) ($request->data()['q'] ?? ''), 'rfc822msgid:')) return ConcProviders::gmailLookup($request);
            if (str_contains($url, 'gmail.googleapis.com') && str_ends_with(parse_url($url, PHP_URL_PATH), '/messages/send')) return self::gmailSend($request);
            if (str_contains($url, 'api.github.com') && parse_url($url, PHP_URL_PATH) === '/user') return Http::response(['login' => 'octocat']);
            if (str_contains($url, 'gmail.googleapis.com') && $request->method() === 'GET') { self::record('GMAIL_READ', substr((string) ($request->header('Authorization')[0] ?? ''), 7)); return Http::response(['messages' => []]); }
            if (str_starts_with($url, 'https://hooks.conc.example/')) { self::record('WEBHOOK', (string) ($request->header('Vibyra-Delivery')[0] ?? '')); return Http::response('ok', 200); } // Part 11 outbound webhooks
            if (str_contains($url, 'exp.host') && str_contains($url, '/push/send')) return self::expoSend($request);
            if (str_contains($url, 'exp.host') && str_contains($url, '/getReceipts')) return Http::response(['data' => new \stdClass]);
            if (str_contains($url, '127.0.0.1:54395')) return self::openRouter($request);
            self::record('STRAY', $request->method().' '.$url);
            return Http::response('stray request blocked by the harness', 599);
        });
    }

    private static function record(string $kind, ?string $key, ?string $note = null, int $stallMs = 0): int
    {
        $id = (int) DB::table('conc_calls')->insertGetId(['kind' => $kind, 'ckey' => $key, 'pid' => getmypid(), 'note' => $note]);
        if ($stallMs > 0) usleep($stallMs * 1000);
        DB::table('conc_calls')->where('id', $id)->update(['ended_at' => DB::raw('clock_timestamp()')]);
        return $id;
    }

    private static function gmailSend($request)
    {
        $token = substr((string) ($request->header('Authorization')[0] ?? ''), 7); // "tok-<userId>"
        $user = (int) substr($token, 4);
        // Was this account's connection already revoked when the provider call happened? (TOCTOU probe.)
        $revoked = DB::table('agent_connections')->where('user_id', $user)->where('provider', 'gmail')->whereNotNull('revoked_at')->exists()
            || !DB::table('vibes_integration_installs')->where('user_id', $user)->where('integration', 'gmail')->exists();
        preg_match('/^Message-ID: (<[^>]+>)/mi', (string) base64_decode(strtr((string) $request['raw'], '-_', '+/')), $m);
        $note = json_encode(['revokedAtCall' => $revoked, 'messageId' => $m[1] ?? null]);
        if (getenv('CONC_SEND_COMMIT_AFTER_STALL')) { // the request is still on its way for the whole stall: a process killed then never reached Gmail
            self::record('GMAIL_INFLIGHT', $token, null, (int) getenv('CONC_SEND_DELAY_MS'));
            $id = self::record('GMAIL_SEND', $token, $note);
        } else $id = self::record('GMAIL_SEND', $token, $note, (int) getenv('CONC_SEND_DELAY_MS'));
        return Http::response(['id' => 'sent-'.$id, 'threadId' => 't-sent']);
    }

    private static function expoSend($request)
    {
        $id = self::record('EXPO_PUSH', (string) ($request['data']['notificationId'] ?? ''), null, (int) getenv('CONC_EXPO_STALL_MS'));
        return Http::response(['data' => ['status' => 'ok', 'id' => 'ticket-'.$id]]);
    }

    private static function openRouter($request)
    {
        $text = json_encode($request['messages'] ?? []);
        $stall = str_contains($text, 'CONC_STALL') ? (int) (getenv('CONC_OPENROUTER_STALL_MS') ?: 20000) : (int) (getenv('CONC_OPENROUTER_DELAY_MS') ?: 250);
        preg_match('/CONC_TURN_[a-z0-9-]+/', $text, $m);
        self::record('OPENROUTER', $m[0] ?? null, null, $stall);
        return Http::response(['id' => 'gen-'.bin2hex(random_bytes(4)), 'choices' => [['message' => ['content' => 'Fake reply.']]],
            'usage' => ['cost' => 0.0002]]);
    }

    public static function count(string $kind, ?string $key = null): int
    {
        return (int) DB::table('conc_calls')->where('kind', $kind)->when($key, fn ($q) => $q->where('ckey', $key))->count();
    }
}
