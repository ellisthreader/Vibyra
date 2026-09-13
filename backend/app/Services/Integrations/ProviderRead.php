<?php

namespace App\Services\Integrations;

use Illuminate\Support\Facades\Http;

class ProviderRead
{
    public function request(string $token, string $url, array $query = [], bool $shop = false): array
    {
        $r = Http::timeout(20)->connectTimeout(10)->withoutRedirecting()->acceptJson();
        $r = $shop ? $r->withHeaders(['X-Shopify-Access-Token' => $token]) : $r->withToken($token);
        $response = $r->get($url, $query);
        abort_if(in_array($response->status(), [401, 403], true), 409, 'Access expired or was removed. Reconnect this account.');
        abort_unless($response->successful() && is_array($response->json()), 503, 'The provider is unavailable. Try again shortly.');

        return $response->json();
    }

    public function identity(array $p, array $tokens, array $flow): array
    {
        $token = $tokens['access_token'];
        $r = match ($p['provider']) {
            'google' => $this->request($token, 'https://www.googleapis.com/oauth2/v3/userinfo'),
            'microsoft' => $this->request($token, 'https://graph.microsoft.com/v1.0/me', ['$select' => 'id,displayName,mail,userPrincipalName']),
            'github' => $this->request($token, 'https://api.github.com/user'),
            'stripe' => ['id' => $tokens['stripe_user_id'] ?? '', 'label' => $tokens['stripe_user_id'] ?? ''],
            'shopify' => $this->shop($token, $flow['shop'], '{shop{id name myshopifyDomain}}')['shop'] ?? [],
        };
        $id = $r['sub'] ?? $r['id'] ?? '';
        abort_unless(is_scalar($id) && (string) $id !== '', 409, 'Could not verify this account.');

        return ['id' => (string) $id, 'label' => mb_substr((string) ($r['email'] ?? $r['mail'] ?? $r['userPrincipalName']
            ?? $r['login'] ?? $r['name'] ?? $r['label'] ?? $id), 0, 255)];
    }

    public function read(string $service, array $credentials): array
    {
        $token = $credentials['access_token'];
        $now = now()->utc();

        return match ($service) {
            'gmail' => $this->gmail($token),
            'google-calendar' => $this->request($token, 'https://www.googleapis.com/calendar/v3/calendars/primary/events',
                ['maxResults' => 20, 'singleEvents' => 'true', 'orderBy' => 'startTime', 'timeMin' => $now->toRfc3339String(),
                    'fields' => 'items(id,summary,start,end,htmlLink),nextPageToken']),
            'google-drive' => $this->request($token, 'https://www.googleapis.com/drive/v3/files',
                ['pageSize' => 20, 'q' => 'trashed = false', 'fields' => 'files(id,name,mimeType,webViewLink),nextPageToken']),
            'outlook' => $this->request($token, 'https://graph.microsoft.com/v1.0/me/messages',
                ['$top' => 20, '$select' => 'id,subject,from,receivedDateTime,bodyPreview,webLink', '$orderby' => 'receivedDateTime desc']),
            'microsoft-calendar' => $this->request($token, 'https://graph.microsoft.com/v1.0/me/calendarView',
                ['startDateTime' => $now->toRfc3339String(), 'endDateTime' => $now->addDays(14)->toRfc3339String(),
                    '$top' => 20, '$select' => 'id,subject,start,end,webLink', '$orderby' => 'start/dateTime']),
            'onedrive' => $this->request($token, 'https://graph.microsoft.com/v1.0/me/drive/root/children',
                ['$top' => 20, '$select' => 'id,name,webUrl,file,folder']),
            'stripe' => $this->payments($token),
            'shopify' => $this->shop($token, $credentials['shop'],
                '{products(first:10){nodes{id title status totalInventory}} orders(first:10,sortKey:CREATED_AT,reverse:true){nodes{id name createdAt displayFinancialStatus totalPriceSet{shopMoney{amount currencyCode}}}}}'),
            'github' => $this->request($token, 'https://api.github.com/user/repos', ['per_page' => 20, 'sort' => 'updated', 'visibility' => 'public']),
            default => abort(422, 'Unknown integration.'),
        };
    }

    private function payments(string $token): array
    {
        $result = $this->request($token, 'https://api.stripe.com/v1/payment_intents', ['limit' => 20]);

        // Stripe objects contain client_secret and customer metadata: project only reporting fields.
        return ['payments' => array_map(fn ($p) => array_intersect_key($p,
            array_flip(['id', 'amount', 'amount_received', 'currency', 'status', 'created', 'livemode'])), $result['data'] ?? []),
            'has_more' => $result['has_more'] ?? false];
    }

    private function gmail(string $token): array
    {
        $list = $this->request($token, 'https://gmail.googleapis.com/gmail/v1/users/me/messages', ['maxResults' => 10]);

        return ['messages' => array_map(function ($message) use ($token): array {
            return $this->request($token, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/'.rawurlencode($message['id']),
                ['format' => 'metadata', 'fields' => 'id,snippet,payload/headers']);
        }, $list['messages'] ?? [])];
    }

    private function shop(string $token, string $shop, string $query): array
    {
        $response = Http::timeout(20)->connectTimeout(10)->withoutRedirecting()->acceptJson()
            ->withHeaders(['X-Shopify-Access-Token' => $token])
            ->post('https://'.Catalog::shop($shop).'/admin/api/2026-07/graphql.json', ['query' => $query]);
        abort_unless($response->successful() && is_array($response->json('data')) && ! $response->json('errors'),
            409, 'Could not read this store. Check access and reconnect.');

        return $response->json('data');
    }
}
