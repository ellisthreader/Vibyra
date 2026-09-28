<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UserPayloads;
use App\Services\Vibes\{FundedTerminals, TerminalCatalog, Wallet};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class FundedTerminalsController extends Controller
{
    use UserPayloads;

    public function models(Request $request, FundedTerminals $terminals, TerminalCatalog $catalog)
    {
        $user = $this->authenticatedUser($request);
        app(Wallet::class)->ensure($user);
        $terminals->authorize($user->id);
        $data = $request->validate(['page' => 'sometimes|integer|min:1', 'revision' => 'sometimes|string|size:64']);
        return $this->json($catalog->page($data['page'] ?? 1, $data['revision'] ?? null));
    }

    public function create(Request $request, FundedTerminals $terminals)
    {
        $user = $this->authenticatedUser($request);
        app(Wallet::class)->ensure($user);
        $data = $request->validate(['id' => 'required|uuid', 'title' => 'required|string|max:100',
            'model' => 'required|string|max:200', 'hostId' => 'required|string|max:150',
            'projectId' => 'required|string|max:150', 'binding' => 'required|uuid',
            'tools' => 'required|boolean', 'budget' => 'required|integer|min:1|max:1000', 'source' => 'required|in:vibyra']);
        return $this->json(['session' => $terminals->create($user->id, $data)]);
    }

    public function close(Request $request, string $chat)
    {
        $user = $this->authenticatedUser($request);
        DB::transaction(function () use ($user, $chat) {
            app(Wallet::class)->lock($user->id);
            DB::table('vibes_chats')->where('id', $chat)->where('user_id', $user->id)->whereNotNull('terminal_model')->firstOrFail();
            abort_if(DB::table('vibes_turns')->where('chat_id', $chat)->whereNull('settled_at')->exists(), 409, 'Stop the current reply before closing the terminal.');
            DB::table('vibes_chats')->where('id', $chat)->update(['terminal_closed_at' => now(), 'revision' => DB::raw('revision + 1')]);
        });
        return $this->json(['ok' => true]);
    }
}
