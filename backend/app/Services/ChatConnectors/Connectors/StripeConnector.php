<?php

namespace App\Services\ChatConnectors\Connectors;

use App\Services\ChatConnectors\Connector;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Money is the one thing this connector will not touch. It reads the balance,
 * the charges and the customer list, and the single thing it may change is that
 * a customer record now exists — no charge, no refund, no payout, no subscription,
 * nothing that moves a penny either way. `writes` in the catalogue says exactly
 * that, because "an AI is connected to my Stripe" is a sentence that deserves a
 * precise answer rather than a reassuring one.
 */
class StripeConnector implements Connector
{
    private const BASE = 'https://api.stripe.com/v1';

    public function definitions(): array
    {
        return array_map(fn ($tool) => ['type' => 'function', 'function' => $tool], [
            ['name' => 'stripe_balance', 'description' => 'Read the available and pending balance on this Stripe account.',
                // An empty property list has to serialise as an object, not as a JSON array.
                'parameters' => ['type' => 'object', 'properties' => new \stdClass, 'required' => [], 'additionalProperties' => false]],
            ['name' => 'stripe_recent_payments', 'description' => 'List the most recent payments, newest first. Up to 50, ten by default.',
                'parameters' => ['type' => 'object', 'properties' => ['limit' => ['type' => 'integer']],
                    'required' => [], 'additionalProperties' => false]],
            ['name' => 'stripe_find_customer', 'description' => 'Find Stripe customers by their exact email address.',
                'parameters' => ['type' => 'object', 'properties' => ['email' => ['type' => 'string']],
                    'required' => ['email'], 'additionalProperties' => false]],
            ['name' => 'stripe_create_customer', 'description' => 'Create a new Stripe customer record. This is the only thing that changes anything, and it moves no money: it cannot charge, refund, pay out, or start a subscription.',
                'parameters' => ['type' => 'object', 'properties' => ['email' => ['type' => 'string'],
                    'name' => ['type' => 'string'], 'description' => ['type' => 'string']],
                    'required' => ['email'], 'additionalProperties' => false]],
        ]);
    }

    public function writes(): array
    {
        return ['stripe_create_customer'];
    }

    public function validate(string $operation, array $arguments): array
    {
        if ($operation === 'stripe_balance') return [];
        if ($operation === 'stripe_recent_payments') {
            $limit = $arguments['limit'] ?? 10;
            abort_unless(is_int($limit) || (is_string($limit) && ctype_digit($limit)), 422, 'Ask for a whole number of payments.');
            return ['limit' => max(1, min(50, (int) $limit))];
        }
        if ($operation === 'stripe_find_customer') {
            $email = $arguments['email'] ?? null;
            abort_unless(is_string($email) && trim($email) !== '' && strlen($email) <= 200, 422, 'Give me the email address to look up.');
            return array_intersect_key($arguments, array_flip(['email']));
        }
        if ($operation === 'stripe_create_customer') {
            $email = $arguments['email'] ?? null;
            abort_unless(is_string($email) && filter_var(trim($email), FILTER_VALIDATE_EMAIL) !== false && strlen($email) <= 200,
                422, 'A Stripe customer needs a real email address.');
            foreach (['name', 'description'] as $optional) {
                $value = $arguments[$optional] ?? null;
                abort_unless($value === null || (is_string($value) && strlen($value) <= 300), 422, 'That '.$optional.' is too long.');
            }
            return array_filter(array_intersect_key($arguments, array_flip(['email', 'name', 'description'])),
                fn ($value) => is_string($value) && trim($value) !== '');
        }
        abort(422, 'That Stripe tool is not available.');
    }

    public function run(string $operation, array $arguments, string $credential): array
    {
        if ($operation === 'stripe_balance') {
            $body = $this->get($credential, '/balance');
            if ($body === null) return $this->unreachable();
            return ['result' => ['available' => $this->amounts($body['available'] ?? []),
                'pending' => $this->amounts($body['pending'] ?? [])], 'summary' => 'Read your Stripe balance'];
        }
        if ($operation === 'stripe_recent_payments') {
            $limit = (int) ($arguments['limit'] ?? 10);
            $body = $this->get($credential, '/charges', ['limit' => $limit]);
            if ($body === null) return $this->unreachable();
            $payments = array_map(fn ($charge) => [
                'id' => (string) ($charge['id'] ?? ''), 'amount' => (int) ($charge['amount'] ?? 0),
                'formatted' => $this->formatted((int) ($charge['amount'] ?? 0)), 'currency' => $charge['currency'] ?? null,
                'status' => $charge['status'] ?? null, 'description' => $charge['description'] ?? null,
                'email' => $charge['billing_details']['email'] ?? null,
                'createdAt' => gmdate('c', (int) ($charge['created'] ?? 0)),
            ], array_slice($body['data'] ?? [], 0, $limit));
            return ['result' => ['payments' => $payments],
                'summary' => 'Listed the '.count($payments).' most recent Stripe payments'];
        }
        if ($operation === 'stripe_find_customer') {
            $email = $arguments['email'];
            $body = $this->get($credential, '/customers', ['email' => $email, 'limit' => 5]);
            if ($body === null) return $this->unreachable();
            $customers = array_map(fn ($customer) => [
                'id' => (string) ($customer['id'] ?? ''), 'name' => $customer['name'] ?? null,
                'email' => $customer['email'] ?? null, 'createdAt' => gmdate('c', (int) ($customer['created'] ?? 0)),
                'delinquent' => (bool) ($customer['delinquent'] ?? false),
            ], array_slice($body['data'] ?? [], 0, 5));
            return ['result' => ['customers' => $customers], 'summary' => 'Looked up the Stripe customer '.$email];
        }
        if ($operation === 'stripe_create_customer') {
            $email = trim($arguments['email']);
            // Two customers with one email is the classic double-run mistake, and it
            // is invisible until someone is billed twice, so an existing record is
            // handed back instead of a second one being made.
            $existing = $this->get($credential, '/customers', ['email' => $email, 'limit' => 1]);
            if (!empty($existing['data'][0]['id'])) {
                return ['result' => ['created' => false, 'id' => (string) $existing['data'][0]['id'], 'email' => $email,
                    'note' => 'A Stripe customer with that email already existed, so nothing was created.'],
                    'summary' => 'Stripe already had a customer for '.$email];
            }
            $customer = $this->post($credential, '/customers', array_filter([
                'email' => $email, 'name' => isset($arguments['name']) ? trim($arguments['name']) : null,
                'description' => isset($arguments['description']) ? trim($arguments['description']) : null,
            ], fn ($value) => $value !== null));
            if ($customer === null) {
                return ['result' => ['error' => 'Stripe did not create that customer. The key may be read-only.'],
                    'summary' => 'Could not create a Stripe customer'];
            }
            return ['result' => ['created' => true, 'id' => (string) ($customer['id'] ?? ''),
                'email' => $customer['email'] ?? $email, 'name' => $customer['name'] ?? null],
                'summary' => 'Created the Stripe customer '.$email];
        }
        return $this->unreachable();
    }

    public function connect(string $credential): string
    {
        $account = $this->get($credential, '/account');
        if ($account === null) {
            // A restricted key may not be allowed to read the account itself, so the
            // balance stands in purely as proof that the key reaches an account.
            if ($this->get($credential, '/balance') === null) {
                throw new RuntimeException('That key did not work. Check it is a restricted key with read access and try again.');
            }
            return 'Stripe account';
        }
        foreach ([$account['settings']['dashboard']['display_name'] ?? null,
            $account['business_profile']['name'] ?? null, $account['id'] ?? null] as $label) {
            if (is_string($label) && trim($label) !== '') return $label;
        }
        return 'Stripe account';
    }

    /** Stripe amounts arrive in the currency's smallest unit, so this assumes a two-decimal currency. */
    private function formatted(int $amount): string
    {
        return number_format($amount / 100, 2);
    }

    private function amounts(array $entries): array
    {
        return array_map(fn ($entry) => ['amount' => (int) ($entry['amount'] ?? 0),
            'formatted' => $this->formatted((int) ($entry['amount'] ?? 0)),
            'currency' => $entry['currency'] ?? null], array_slice($entries, 0, 20));
    }

    private function request(string $credential)
    {
        return Http::withToken($credential)->acceptJson()->timeout((int) config('chat_connectors.timeout_seconds', 12));
    }

    /** The decoded body, or null when Stripe refused or could not be reached. */
    private function get(string $credential, string $path, array $query = []): ?array
    {
        $response = $this->request($credential)->get(self::BASE.$path, $query);
        if (!$response->successful()) return null;
        $body = $response->json();
        return is_array($body) ? $body : null;
    }

    /** The created resource, or null when Stripe refused. Stripe takes form bodies, not JSON. */
    private function post(string $credential, string $path, array $payload): ?array
    {
        $response = $this->request($credential)->asForm()->post(self::BASE.$path, $payload);
        if (!$response->successful()) return null;
        $body = $response->json();
        return is_array($body) ? $body : null;
    }

    private function unreachable(): array
    {
        return ['result' => ['error' => 'Stripe could not be reached just now. Please try again in a moment.'],
            'summary' => 'Could not reach Stripe'];
    }
}
