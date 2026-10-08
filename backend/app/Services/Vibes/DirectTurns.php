<?php

namespace App\Services\Vibes;

use App\Services\Billing\OpenRouterPricingNormalizer;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

/** One-step admission; pricing and reservations remain private server responsibilities. */
final class DirectTurns
{
    public function submit(int $userId, string $id, array $message): object
    {
        $d = Validator::make($message, [
            'chatId' => 'required|uuid', 'text' => 'required|string|max:4000', 'model' => 'required|string|max:200',
            'effort' => ['nullable', 'string', Rule::in(OpenRouterPricingNormalizer::EFFORTS)],
            'integrations' => 'sometimes|array|max:8', 'integrations.*' => 'string|max:40',
            'attachments' => 'sometimes|array|max:'.Attachments::PER_MESSAGE, 'attachments.*' => 'uuid',
        ])->validate();
        $digest = hash('sha256', json_encode(['direct' => 1, 'chatId' => $d['chatId'], 'text' => $d['text'],
            'model' => $d['model'], 'effort' => $d['effort'] ?? null,
            'integrations' => $d['integrations'] ?? [], 'attachments' => $d['attachments'] ?? []]));
        return DB::transaction(function () use ($userId, $id, $d, $digest) {
            app(Wallet::class)->lock($userId);
            $existing = DB::table('vibes_turns')->where('id', $id)->first();
            if ($existing) {
                abort_unless($existing->user_id == $userId && hash_equals($existing->digest, $digest), 409, 'This submission was already used.');
                return $existing;
            }
            $quotes = app(Quotes::class);
            $quote = $quotes->create($userId, $d['chatId'], $d['text'], $d['model'], $d['effort'] ?? null,
                $d['integrations'] ?? [], $d['attachments'] ?? [], partial: true);
            $q = $quotes->decode($quote['quote'], $userId);
            if (empty($q['request']['vibyraAgent'])) abort_if(count(array_diff($d['integrations'] ?? [], $q['integrations'])) > 0, 422,
                'A referenced integration is no longer available. Refresh your connections before sending.');
            $q['directDigest'] = $digest;
            return app(Turns::class)->submit($userId, $id, $q);
        }, 5);
    }
}
