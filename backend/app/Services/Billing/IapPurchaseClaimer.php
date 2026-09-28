<?php

namespace App\Services\Billing;

use App\Models\IapReceipt;
use App\Models\User;
use Closure;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class IapPurchaseClaimer
{
    /**
     * @param  array{
     *     transactionId: string,
     *     originalTransactionId: string,
     *     productId: string,
     *     environment: string,
     *     state: string,
     *     expiresAt: mixed,
     *     payload: array
     * }  $verified
     * @param  Closure(User, IapReceipt, string): void  $applyPurchase
     * @return array{receipt: IapReceipt, idempotent: bool}
     */
    public function claim(
        User $user,
        string $platform,
        string $clientProductId,
        string $clientTransactionId,
        array $verified,
        Closure $applyPurchase,
    ): array {
        $this->assertCanonicalIdentity($clientProductId, $clientTransactionId, $verified);

        try {
            return DB::transaction(function () use (
                $user,
                $platform,
                $clientTransactionId,
                $verified,
                $applyPurchase
            ): array {
                $lockedUser = User::lockForUpdate()->findOrFail($user->id);
                $existing = $this->findExisting($platform, $verified);

                if ($existing) {
                    return $this->resolveExisting(
                        $existing,
                        $lockedUser,
                        $clientTransactionId,
                        $verified,
                        $applyPurchase
                    );
                }

                $receipt = IapReceipt::create($this->attributes(
                    $lockedUser,
                    $platform,
                    $clientTransactionId,
                    $verified
                ));
                $applyPurchase($lockedUser, $receipt, (string) $verified['transactionId']);

                return ['receipt' => $receipt, 'idempotent' => false];
            }, 3);
        } catch (QueryException $exception) {
            if (! $this->isUniqueViolation($exception)) {
                throw $exception;
            }

            return DB::transaction(function () use (
                $user,
                $platform,
                $clientTransactionId,
                $verified,
                $applyPurchase
            ): array {
                $lockedUser = User::lockForUpdate()->findOrFail($user->id);
                $existing = $this->findExisting($platform, $verified);
                if (! $existing) {
                    throw new RuntimeException('Purchase claim conflicted but no canonical receipt was found.');
                }

                return $this->resolveExisting(
                    $existing,
                    $lockedUser,
                    $clientTransactionId,
                    $verified,
                    $applyPurchase
                );
            }, 3);
        }
    }

    private function assertCanonicalIdentity(
        string $clientProductId,
        string $clientTransactionId,
        array $verified
    ): void {
        foreach (['transactionId', 'originalTransactionId', 'productId'] as $key) {
            if (trim((string) ($verified[$key] ?? '')) === '') {
                throw new RuntimeException("Store verification did not return {$key}.");
            }
        }
        if (! hash_equals($clientProductId, (string) $verified['productId'])) {
            throw new IapPurchaseConflictException('Verified product does not match the requested product.');
        }
        if (! hash_equals($clientTransactionId, (string) $verified['transactionId'])) {
            throw new IapPurchaseConflictException('Client transaction ID does not match the verified store transaction.');
        }
    }

    private function findExisting(string $platform, array $verified): ?IapReceipt
    {
        return IapReceipt::where('platform', $platform)
            ->where(function ($query) use ($verified): void {
                $query->where('original_transaction_id', $verified['originalTransactionId'])
                    ->orWhere('transaction_id', $verified['transactionId']);
            })
            ->lockForUpdate()
            ->first();
    }

    private function resolveExisting(
        IapReceipt $existing,
        User $user,
        string $clientTransactionId,
        array $verified,
        Closure $applyPurchase
    ): array {
        if ((int) $existing->user_id !== (int) $user->id) {
            throw new IapPurchaseConflictException('This store purchase is already owned by another account.');
        }
        if (! hash_equals((string) $existing->product_id, (string) $verified['productId'])) {
            throw new IapPurchaseConflictException('This canonical purchase is already assigned to another product.');
        }

        $isNewStoreTransaction = ! hash_equals(
            (string) $existing->transaction_id,
            (string) $verified['transactionId']
        );
        $existing->forceFill($this->attributes(
            $user,
            (string) $existing->platform,
            $clientTransactionId,
            $verified
        ))->save();

        if ($isNewStoreTransaction) {
            $applyPurchase($user, $existing, (string) $verified['transactionId']);
        }

        return ['receipt' => $existing, 'idempotent' => ! $isNewStoreTransaction];
    }

    private function attributes(
        User $user,
        string $platform,
        string $clientTransactionId,
        array $verified
    ): array {
        return [
            'user_id' => $user->id,
            'platform' => $platform,
            'product_id' => $verified['productId'],
            'transaction_id' => $verified['transactionId'],
            'client_transaction_id' => $clientTransactionId,
            'original_transaction_id' => $verified['originalTransactionId'],
            'environment' => $verified['environment'] ?? 'unknown',
            'purchase_state' => $verified['state'] ?? 'verified',
            'expires_at' => $verified['expiresAt'] ?? null,
            'payload' => $verified['payload'] ?? null,
        ];
    }

    private function isUniqueViolation(QueryException $exception): bool
    {
        return in_array((string) $exception->getCode(), ['23000', '23505'], true)
            || str_contains(strtolower($exception->getMessage()), 'unique constraint');
    }
}
