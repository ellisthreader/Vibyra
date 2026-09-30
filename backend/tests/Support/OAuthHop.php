<?php

namespace Tests\Support;

use Illuminate\Testing\TestResponse;

/**
 * How a test plays the system browser sheet. `start` answers with a Vibyra link. The sheet opens it, reads the
 * confirmation page that names the Vibyra account, presses Continue, and only then is sent to the provider, with the
 * binding cookie that press set. Only the browser that holds that cookie can finish the sign-in.
 * `visitHop` and `pressHop` are one browser's two requests, with a cookie jar of its own (session) and never the
 * bearer token the test holds.
 */
trait OAuthHop
{
    /** A browser opens a hop link. @return array{0: TestResponse, 1: array<string, string>} the page and the cookies it keeps */
    protected function visitHop(string $url): array
    {
        $this->flushSession(); // a fresh browser: the in-process session store would otherwise hand it the last one's token
        $page = $this->call('GET', $url);
        $jar = [];
        foreach ($page->headers->getCookies() as $cookie) $jar[$cookie->getName()] = (string) $cookie->getValue();
        return [$page, $jar];
    }

    /** That browser presses a button (`continue` or `cancel`) on the page it was shown; `$token` replaces the page's CSRF token. */
    protected function pressHop(string $url, array $visit, string $choice = 'continue', ?string $token = null): TestResponse
    {
        [$page, $jar] = $visit;
        $this->flushSession(); // the press reads its session back from the cookie, as a real request would
        preg_match('/name="_token" value="([^"]+)"/', (string) $page->getContent(), $found);
        return $this->call('POST', $url, ['_token' => $token ?? ($found[1] ?? ''), 'choice' => $choice], $jar);
    }

    /** The provider page this link sends the browser to; the browser keeps the nonce cookie (the account holder's own sheet). */
    protected function openSignIn(string $url): string
    {
        $visit = $this->visitHop($url);
        $visit[0]->assertOk();
        $done = $this->pressHop($url, $visit)->assertStatus(302);
        foreach ($done->headers->getCookies() as $cookie) {
            if (str_starts_with($cookie->getName(), 'vb_oauth_')) $this->withUnencryptedCookie($cookie->getName(), (string) $cookie->getValue());
        }
        return (string) $done->headers->get('Location');
    }

    /** The provider page as a script (a different client, no cookie kept) sees it: what an attacker can read out of `start`. */
    protected function providerPageWithoutCookie(string $url): string
    {
        if (!str_starts_with($url, (string) config('app.url'))) return $url;
        return (string) $this->pressHop($url, $this->visitHop($url))->assertStatus(302)->headers->get('Location');
    }

    /** Service-level stand-in for the sheet: the provider page a start result leads to, and the nonce its cookie would carry. */
    protected function openedFlow(array $start): array
    {
        $hop = app(\App\Services\ChatConnectors\OAuthFlows::class)->open($start['flowId']);
        return [(string) $hop['url'], (string) $hop['nonce']];
    }

    protected function queryOf(string $url): array
    {
        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);
        return $query;
    }
}
