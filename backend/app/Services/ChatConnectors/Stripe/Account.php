<?php

namespace App\Services\ChatConnectors\Stripe;

final class Account
{
    public function __construct(private readonly Client $client) {}

    public function read(string $token): array
    {
        $r = $this->client->get($token, '/account');
        if (isset($r['error'])) return $r;
        $a = $r['data'];
        return ['id' => $a['id'] ?? null, 'name' => $a['settings']['dashboard']['display_name'] ?? $a['business_profile']['name'] ?? null,
            'website' => $a['business_profile']['url'] ?? null, 'country' => $a['country'] ?? null,
            'defaultCurrency' => $a['default_currency'] ?? null, 'chargesEnabled' => $a['charges_enabled'] ?? false,
            'note' => 'The connected account is the only account queried. A project may share this account; confirm scope.'];
    }

    public function projects(string $token): array
    {
        $r = $this->client->get($token, '/charges', ['limit' => 100]);
        if (isset($r['error'])) return $r;
        $projects = [];
        foreach ($r['data']['data'] ?? [] as $c) foreach (['project', 'project_id', 'projectId', 'app', 'app_id'] as $key) {
            $value = $c['metadata'][$key] ?? null;
            if (is_string($value) && $value !== '') $projects[$key.'\0'.$value] = ['metadataKey' => $key, 'metadataValue' => $value];
        }
        return ['projects' => array_slice(array_values($projects), 0, 50), 'sampledPayments' => count($r['data']['data'] ?? []),
            'sampleOnly' => true, 'hasMorePayments' => (bool) ($r['data']['has_more'] ?? false),
            'note' => 'Sample of common project metadata keys on the latest 100 charges. Missing tags do not mean zero project revenue. Confirm an exact tag or account-wide scope.'];
    }
}
