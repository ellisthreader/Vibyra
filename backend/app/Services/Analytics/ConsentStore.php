<?php

namespace App\Services\Analytics;

use App\Models\VibyraSession;
use Illuminate\Support\Facades\DB;

class ConsentStore
{
    public const POLICY_VERSION = 1;

    public function subjectHash(VibyraSession $session, string $surface): string
    {
        return hash_hmac('sha256', "session:{$session->id}:{$surface}", (string) config('app.key'));
    }

    public function state(VibyraSession $session, string $surface): array
    {
        $record = DB::table('analytics_consents')->where('surface', $surface)
            ->where('subject_hash', $this->subjectHash($session, $surface))->first();

        return [
            'choice' => $record && (int) $record->policy_version === self::POLICY_VERSION
                ? $record->choice : 'unknown',
            'policy_version' => self::POLICY_VERSION,
            'updated_at' => $record && (int) $record->policy_version === self::POLICY_VERSION
                ? $record->updated_at : null,
        ];
    }

    /** Call only inside the event insert transaction so withdrawal cannot overtake it. */
    public function allowedChoiceForUpdate(VibyraSession $session, string $surface): ?string
    {
        $record = DB::table('analytics_consents')->where('surface', $surface)
            ->where('subject_hash', $this->subjectHash($session, $surface))
            ->lockForUpdate()->first();
        if (! $record || (int) $record->policy_version !== self::POLICY_VERSION) {
            return null;
        }

        return in_array($record->choice, ['aggregate', 'linked'], true) ? $record->choice : null;
    }

    public function change(VibyraSession $session, string $surface, string $choice): array
    {
        $user = $session->user;
        $hash = $this->subjectHash($session, $surface);
        DB::transaction(function () use ($user, $surface, $choice, $hash): void {
            $now = now();
            $created = DB::table('analytics_consents')->insertOrIgnore([
                'user_id' => $user->id,
                'surface' => $surface,
                'subject_hash' => $hash,
                'choice' => 'declined',
                'policy_version' => self::POLICY_VERSION,
                'withdrawn_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $previous = DB::table('analytics_consents')->where('surface', $surface)
                ->where('subject_hash', $hash)->lockForUpdate()->first();
            if ($choice === 'declined') {
                $rows = DB::table('analytics_consents')->where('user_id', $user->id)
                    ->where('surface', $surface)->orderBy('id')->lockForUpdate()->get();
                DB::table('analytics_events')->where('surface', $surface)
                    ->whereIn('consent_subject_hash', $rows->pluck('subject_hash'))->delete();
                DB::table('analytics_events')->where('surface', $surface)
                    ->where('user_id', $user->id)->delete();
                foreach ($rows as $row) {
                    if ($row->choice === 'declined'
                        && (int) $row->policy_version === self::POLICY_VERSION
                        && ! ($created && $row->subject_hash === $hash)) {
                        continue;
                    }
                    DB::table('analytics_consents')->where('id', $row->id)->update([
                        'choice' => 'declined', 'policy_version' => self::POLICY_VERSION,
                        'consented_at' => null, 'withdrawn_at' => $now, 'updated_at' => $now,
                    ]);
                    $this->audit($user->id, $surface, $row->subject_hash,
                        $created && $row->subject_hash === $hash ? null : $row->choice, 'declined', $now);
                }

                return;
            }
            if (! $created && $previous->choice === $choice
                && (int) $previous->policy_version === self::POLICY_VERSION) {
                return;
            }

            if ($previous->choice === 'linked') {
                DB::table('analytics_events')->where('surface', $surface)
                    ->where('consent_subject_hash', $hash)->delete();
            }
            DB::table('analytics_consents')->where('id', $previous->id)->update([
                'choice' => $choice,
                'policy_version' => self::POLICY_VERSION,
                'consented_at' => $now,
                'withdrawn_at' => null,
                'updated_at' => $now,
            ]);
            $this->audit($user->id, $surface, $hash, $created ? null : $previous->choice, $choice, $now);
        }, 3);

        return $this->state($session, $surface);
    }

    private function audit(int $userId, string $surface, string $hash, ?string $old, string $new, $now): void
    {
        DB::table('analytics_consent_changes')->insert([
            'user_id' => $userId,
            'surface' => $surface,
            'subject_hash' => $hash,
            'old_choice' => $old,
            'new_choice' => $new,
            'policy_version' => self::POLICY_VERSION,
            'created_at' => $now,
        ]);
    }
}
