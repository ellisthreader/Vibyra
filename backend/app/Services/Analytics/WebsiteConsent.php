<?php

namespace App\Services\Analytics;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class WebsiteConsent
{
    public const VERSION = 1;

    public function subject(Request $request): string
    {
        $session = $request->session();
        $id = $session->get('website_analytics_subject');
        if (! is_string($id) || ! Str::isUuid($id)) {
            $id = (string) Str::uuid();
            $session->put('website_analytics_subject', $id);
        }

        return hash_hmac('sha256', 'website:'.$id, (string) config('app.key'));
    }

    public function current(Request $request, bool $lock = false): array
    {
        $subject = $this->subject($request);
        $query = DB::table('analytics_consents')->where('surface', 'website')->where('subject_hash', $subject);
        $local = ($lock ? $query->lockForUpdate() : $query)->first();
        if ($local && (int) $local->policy_version === self::VERSION) {
            return ['choice' => $local->choice, 'policy_version' => self::VERSION,
                'updated_at' => $local->updated_at, 'subject_hash' => $subject];
        }

        // A signed-in account's choice in another browser is not consent from this browser.
        return ['choice' => 'unknown', 'policy_version' => self::VERSION,
            'updated_at' => null, 'subject_hash' => $subject];
    }

    public function save(Request $request, string $choice): array
    {
        $subject = $this->subject($request);
        $userId = $request->user('web')?->id;
        DB::transaction(function () use ($subject, $userId, $choice): void {
            $previous = DB::table('analytics_consents')->where('surface', 'website')
                ->where('subject_hash', $subject)->lockForUpdate()->first();
            $hadLinkedChoice = $previous?->choice === 'linked' || ($userId && DB::table('analytics_consents')
                ->where('surface', 'website')->where('user_id', $userId)->where('choice', 'linked')->exists());
            $old = $previous;
            if ($choice === 'declined' || ($hadLinkedChoice && $choice === 'aggregate')) {
                $subjects = [$subject];
                if ($userId) {
                    $others = DB::table('analytics_consents')
                        ->where('surface', 'website')->where('user_id', $userId)
                        ->get(['subject_hash', 'choice']);
                    $subjects = array_merge($subjects, $others->pluck('subject_hash')->all());
                    foreach ($others as $other) {
                        if ($other->subject_hash === $subject || $other->choice === 'declined') continue;
                        DB::table('analytics_consent_changes')->insert([
                            'user_id' => $userId, 'surface' => 'website',
                            'subject_hash' => $other->subject_hash, 'old_choice' => $other->choice,
                            'new_choice' => 'declined', 'policy_version' => self::VERSION,
                            'created_at' => now(),
                        ]);
                    }
                    DB::table('analytics_consents')->where('surface', 'website')
                        ->where('user_id', $userId)->update([
                            'choice' => 'declined', 'withdrawn_at' => now(), 'updated_at' => now(),
                        ]);
                }
                DB::table('analytics_events')->where('surface', 'website')
                    ->whereIn('consent_subject_hash', array_unique($subjects))->delete();
            }
            DB::table('analytics_consents')->updateOrInsert(
                ['surface' => 'website', 'subject_hash' => $subject],
                ['user_id' => $userId, 'choice' => $choice, 'policy_version' => self::VERSION,
                    'consented_at' => $choice === 'declined' ? null : now(),
                    'withdrawn_at' => $choice === 'declined' ? now() : null,
                    'updated_at' => now(), 'created_at' => $old?->created_at ?? now()]
            );
            DB::table('analytics_consent_changes')->insert([
                'user_id' => $userId, 'surface' => 'website', 'subject_hash' => $subject,
                'old_choice' => $old?->choice, 'new_choice' => $choice,
                'policy_version' => self::VERSION, 'created_at' => now(),
            ]);
        });

        return $this->current($request);
    }
}
