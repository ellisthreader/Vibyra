<?php
namespace App\Http\Controllers;
use App\Http\Controllers\Concerns\UserPayloads;
use App\Services\Notifications\{Devices, Inbox, Preferences};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
final class PhoneNotificationsController extends Controller
{
    use UserPayloads;
    public function preferences(Request $r, Preferences $p)
    {
        $user = $this->authenticatedUser($r);
        $data = $r->isMethod('patch') ? $r->validate(['revision' => 'required|integer|min:1',
            'attention' => 'sometimes|boolean', 'replies' => 'sometimes|boolean', 'smart' => 'sometimes|boolean',
            'advisories' => 'sometimes|boolean', 'timezone' => 'sometimes|timezone',
            'quietStart' => 'present|nullable|integer|min:0|max:1439', 'quietEnd' => 'present|nullable|integer|min:0|max:1439']) : null;
        return $this->privateJson(['preferences' => $data ? $p->save($user->id, $data) : $p->payload($user->id),
            'deviceId' => DB::table('notification_devices')->where('user_id', $user->id)->where('session_id', $this->authenticatedSession($r)->id)->whereNull('revoked_at')->value('id'),
            'capabilities' => ['inbox' => (bool) config('intelligence.inbox'), 'push' => (bool) config('intelligence.push'),
                'smart' => config('intelligence.jev_mode') !== 'off']]);
    }
    public function register(Request $r, Devices $devices)
    {
        $this->authenticatedUser($r);
        $data = $r->validate(['installation' => 'required|uuid', 'proof' => 'required|string|min:32|max:128',
            'token' => ['required','string','max:256','regex:/^(ExponentPushToken|ExpoPushToken)\[[a-zA-Z0-9_-]+\]$/'],
            'projectId' => 'required|uuid', 'environment' => 'required|in:development,production']);
        return $this->privateJson($devices->register($this->authenticatedSession($r), $data));
    }
    public function revoke(Request $r, string $id)
    {
        $user = $this->authenticatedUser($r);
        DB::table('notification_devices')->where('id', $id)->where('user_id', $user->id)->update(['revoked_at' => now()]);
        return $this->privateJson(['ok' => true]);
    }
    public function presence(Request $r)
    {
        $user = $this->authenticatedUser($r);
        $d = $r->validate(['deviceId' => 'required|uuid', 'runId' => 'present|nullable|string|max:160']);
        DB::table('notification_devices')->where('id', $d['deviceId'])->where('user_id', $user->id)
            ->where('session_id', $this->authenticatedSession($r)->id)->whereNull('revoked_at')
            ->update(['visible_run' => $d['runId'], 'present_until' => now()->addSeconds(40)]);
        return $this->privateJson(['ok' => true]);
    }
    public function index(Request $r, Inbox $inbox)
    {
        $user = $this->authenticatedUser($r);
        abort_unless(config('intelligence.inbox'), 503, 'Notifications are not available yet.');
        $data = $r->validate(['before' => 'sometimes|date']);
        $items = DB::table('notification_items')->where('user_id', $user->id)
            ->when(isset($data['before']), fn ($q) => $q->where('created_at', '<', $data['before']))
            ->orderByDesc('created_at')->orderByDesc('id')->limit(50)->get();
        return $this->privateJson(['items' => $items->map(fn ($i) => $inbox->payload($i))->all()]);
    }
    public function show(Request $r, string $id, Inbox $inbox)
    {
        $user = $this->authenticatedUser($r);
        $item = DB::table('notification_items')->where('id', $id)->where('user_id', $user->id)->firstOrFail();
        return $this->privateJson(['item' => $inbox->payload($item)]);
    }
    public function read(Request $r, string $id)
    {
        $user = $this->authenticatedUser($r);
        DB::table('notification_items')->where('id', $id)->where('user_id', $user->id)->whereNull('read_at')->update(['read_at' => now()]);
        return $this->privateJson(['ok' => true]);
    }
    private function privateJson(array $data)
    {
        return response()->json(['version' => 1, ...$data])->header('Cache-Control', 'private, no-store');
    }
}
