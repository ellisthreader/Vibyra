<?php
namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UserPayloads;
use App\Services\LiveStatus\{Card, Pusher};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\{Crypt, DB};
use Illuminate\Support\Str;

/**
 * Mac status on the iPhone while it is locked. The Mac posts the names-only snapshot its
 * menu bar shows; the iPhone registers the tokens ActivityKit gives it. Pushes go out after
 * the response, so neither caller ever waits on Apple.
 */
final class LiveStatusController extends Controller
{
    use UserPayloads;

    private const HEX = '/^[0-9a-f]{32,256}$/i';

    private function ready(): void
    {
        abort_unless(config('live_status.enabled'), 503, 'Live status is not available yet.');
    }

    public function mac(Request $r)
    {
        $this->ready();
        $user = $this->authenticatedUser($r);
        $row = ['key' => 'required|string|max:120', 'title' => 'required|string|max:200', 'project' => 'nullable|string|max:200', 'agent' => 'nullable|string|max:40'];
        $d = $r->validate([
            'name' => 'required|string|max:120',
            'attention' => 'present|array|max:6', 'working' => 'present|array|max:6', 'recent' => 'present|array|max:3',
            ...collect($row)->mapWithKeys(fn ($v, $k) => ["attention.*.$k" => $v, "working.*.$k" => $v])->all(),
            'recent.*.key' => 'required|string|max:120', 'recent.*.title' => 'required|string|max:200', 'recent.*.outcome' => 'required|in:done,failed',
        ]);
        $clean = fn (array $rows) => array_map(fn ($x) => ['key' => Card::text($x['key'], 120), 'title' => Card::text($x['title'], 40),
            'project' => Card::text($x['project'] ?? '', 28), 'agent' => Card::agent($x['agent'] ?? '') ?? ''], $rows);
        $snap = ['attention' => $clean($d['attention']), 'working' => $clean($d['working']),
            'recent' => array_map(fn ($x) => ['key' => Card::text($x['key'], 120), 'title' => Card::text($x['title'], 40), 'outcome' => $x['outcome']], $d['recent'])];
        $busy = $snap['attention'] || $snap['working'];
        $existing = DB::table('live_status_snapshots')->where('user_id', $user->id)->first();
        DB::table('live_status_snapshots')->updateOrInsert(['user_id' => $user->id], [
            'mac_name' => Card::text($d['name'], 64) ?: 'Your Mac', 'snapshot' => json_encode($snap),
            'busy_at' => $busy ? now() : ($existing->busy_at ?? null), 'created_at' => $existing->created_at ?? now(), 'updated_at' => now()]);
        $this->deliverLater($user->id);
        return $this->privateJson(['ok' => true, 'phones' => DB::table('live_status_phones')->where('user_id', $user->id)->count()]);
    }

    public function phone(Request $r)
    {
        $this->ready();
        $user = $this->authenticatedUser($r);
        if ($r->isMethod('delete')) {
            $d = $r->validate(['installId' => 'required|string|max:64']);
            DB::table('live_status_phones')->where('user_id', $user->id)->where('install_id', $d['installId'])->delete();
            return $this->privateJson(['ok' => true]);
        }
        $d = $r->validate(['installId' => 'required|string|max:64', 'startToken' => ['nullable', 'string', 'regex:'.self::HEX],
            'cardToken' => ['nullable', 'string', 'regex:'.self::HEX], 'cardEnded' => 'sometimes|boolean']);
        $existing = DB::table('live_status_phones')->where('user_id', $user->id)->where('install_id', $d['installId'])->first();
        $values = ['updated_at' => now()];
        foreach (['startToken' => 'start', 'cardToken' => 'card'] as $field => $col) {
            if (empty($d[$field])) continue;
            $hash = hash_hmac('sha256', strtolower($d[$field]), (string) config('app.key'));
            // A token is unique across accounts and phones: whoever registers it last owns it.
            DB::table('live_status_phones')->where("{$col}_hash", $hash)->where('id', '!=', $existing->id ?? '')->update(["{$col}_token" => null, "{$col}_hash" => null]);
            $values["{$col}_token"] = Crypt::encryptString(strtolower($d[$field]));
            $values["{$col}_hash"] = $hash;
            // A new card has seen nothing yet: the next send brings it up to date.
            if ($col === 'card' && ($existing->card_hash ?? null) !== $hash) $values += ['last_state' => null, 'last_sent_at' => null];
        }
        if (!empty($d['cardEnded'])) $values += ['card_token' => null, 'card_hash' => null, 'last_state' => null, 'last_alert' => null];
        DB::table('live_status_phones')->updateOrInsert(['user_id' => $user->id, 'install_id' => $d['installId']],
            [...$values, 'id' => $existing->id ?? (string) Str::uuid(), 'created_at' => $existing->created_at ?? now()]);
        $this->deliverLater($user->id);
        return $this->privateJson(['ok' => true]);
    }

    private function deliverLater(int $userId): void
    {
        dispatch(fn () => app(Pusher::class)->deliver($userId))->afterResponse();
    }

    private function privateJson(array $data)
    {
        return response()->json(['version' => 1, ...$data])->header('Cache-Control', 'private, no-store');
    }
}
