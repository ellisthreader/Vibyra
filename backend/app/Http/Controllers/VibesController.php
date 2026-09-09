<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UserPayloads;
use App\Jobs\RunVibesTurn;
use App\Models\User;
use App\Services\Vibes\{Catalog, Quotes, Turns, Wallet};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class VibesController extends Controller
{
    use UserPayloads;

    private function account(Request $request): User
    {
        $user = $this->authenticatedUser($request);
        app(Wallet::class)->ensure($user);
        return $user;
    }

    public function wallet(Request $request, Wallet $wallet)
    {
        return $this->json(['wallet' => $wallet->payload($this->account($request)->id)]);
    }

    public function consent(Request $request)
    {
        $id = $this->account($request)->id;
        $data = $request->validate(['accepted' => 'required|accepted']);
        DB::table('vibes_wallets')->where('user_id', $id)->update(['consented_at' => now()]);
        return $this->json(['ok' => true]);
    }

    // The catalogue is a public menu, not account state. It must answer before
    // sign-in and while the chat flag is off, or the phone's picker offers nothing
    // but Auto. Every path that spends Vibes stays gated on `vibes.enabled`.
    public function models(Request $request, Catalog $catalog, Wallet $wallet)
    {
        $user = $this->optionalAuthenticatedUser($request);
        if ($user) $wallet->ensure($user);
        return $this->json(['models' => $catalog->models($user ? $wallet->planFor($user->id) : 'free')]);
    }

    public function chats(Request $request)
    {
        $id = $this->account($request)->id;
        if ($request->isMethod('post')) {
            abort_unless(config('vibes.enabled'), 503, 'AI chat is not available yet. Your computer sessions still work.');
            $data = $request->validate(['id' => 'required|uuid', 'title' => 'required|string|max:100']);
            DB::transaction(function () use ($id, $data) {
                app(Wallet::class)->lock($id);
                $existing = DB::table('vibes_chats')->where('id', $data['id'])->first();
                abort_if($existing && $existing->user_id != $id, 409);
                abort_if(!$existing && DB::table('vibes_chats')->where('user_id', $id)->count() >= 500, 422, 'Chat limit reached.');
                if (!$existing) DB::table('vibes_chats')->insert([...$data, 'user_id' => $id, 'created_at' => now(), 'updated_at' => now()]);
            });
        }
        return $this->json(['chats' => DB::table('vibes_chats')->where('user_id', $id)->orderByDesc('updated_at')->limit(100)->get()]);
    }

    public function quote(Request $request, Quotes $quotes)
    {
        abort_unless(config('vibes.enabled'), 503, 'AI chat is not available yet. Your computer sessions still work.');
        $user = $this->account($request);
        abort_unless($user->hasVerifiedEmail(), 403, 'Verify your email to use your free Vibes.');
        $d = $request->validate(['chatId' => 'required|uuid', 'text' => 'required|string|max:4000', 'model' => 'required|string|max:150']);
        return $this->json($quotes->create($user->id, $d['chatId'], $d['text'], $d['model']));
    }

    public function submit(Request $request, Quotes $quotes, Turns $turns)
    {
        abort_unless(config('vibes.enabled'), 503, 'AI chat is not available yet. Your computer sessions still work.');
        $user = $this->account($request);
        abort_unless($user->hasVerifiedEmail(), 403, 'Verify your email to use Vibes.');
        $d = $request->validate(['id' => 'required|uuid', 'quote' => 'required|string|max:100000']);
        $turn = $turns->submit($user->id, $d['id'], $quotes->decode($d['quote'], $user->id));
        if ($turn->status === 'queued') RunVibesTurn::dispatch($turn->id);
        return $this->json(['turn' => $turns->payload($turn)], 202);
    }

    public function turns(Request $request, string $chat, Turns $turns)
    {
        $id = $this->account($request)->id;
        DB::table('vibes_chats')->where('id', $chat)->where('user_id', $id)->firstOrFail();
        return $this->json(['turns' => DB::table('vibes_turns')->where('chat_id', $chat)->orderByDesc('created_at')->orderByDesc('id')
            ->limit(200)->get()->reverse()->values()->map(fn ($t) => $turns->payload($t))]);
    }

    public function status(Request $request, string $turn, Turns $turns)
    {
        $id = $this->account($request)->id;
        return $this->json(['turn' => $turns->payload(DB::table('vibes_turns')->where('id', $turn)->where('user_id', $id)->firstOrFail())]);
    }

    public function cancel(Request $request, string $turn, Turns $turns)
    {
        $id = $this->account($request)->id;
        DB::transaction(function () use ($id, $turn, $turns) {
            app(Wallet::class)->lock($id);
            DB::table('vibes_turns')->where('id', $turn)->where('user_id', $id)->firstOrFail();
            $beforeDispatch = DB::table('vibes_turns')->where('id', $turn)->whereIn('status', ['queued', 'waiting'])
                ->whereNull('settled_at')->update(['status' => 'cancelled', 'cancel_requested' => true]);
            DB::table('vibes_turns')->where('id', $turn)->whereNull('settled_at')->update(['cancel_requested' => true]);
            if ($beforeDispatch) $turns->settle($turn, (int) DB::table('vibes_turns')->where('id', $turn)->value('actual_micro_usd'), null, 'Stopped. Only confirmed AI usage was charged.');
        });
        return $this->json(['ok' => true]);
    }
}
