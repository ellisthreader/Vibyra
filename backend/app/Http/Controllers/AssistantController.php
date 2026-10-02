<?php
namespace App\Http\Controllers;

use App\Services\Assistant\{Budget, ChatStream, Failure, Input, Provider, SpeechAudio, Tokens};
use Illuminate\Http\Request;

final class AssistantController
{
    public function __construct(private Budget $budget, private Input $input, private Provider $provider) {}

    public function status(Request $request)
    {
        $ready = $this->budget->ready();
        $balance = 0; $scale = 10000;
        if ($ready) {
            $user = $request->attributes->get('assistant.user')->id;
            app(Tokens::class)->prepare($user);
            $scale = \App\Services\Membership\Units::scale($user);
            $grants = \Illuminate\Support\Facades\DB::table('vibes_grants')->where('user_id', $user)->whereNull('revoked_at');
            if ($scale === 1) $grants->where('kind', '!=', 'trial');
            $balance = (int) $grants->sum('remaining');
        }
        $reason = !$ready ? 'The Vibyra assistant is temporarily unavailable.'
            : ($balance <= 0 ? 'You need Vibyra tokens to use the assistant. Open your token balance to continue.' : null);
        return response()->json(['available' => $ready && $balance > 0, 'reason' => $reason,
            'funding' => 'vibyra_tokens', 'availableUnits' => (string) $balance, 'unitScale' => $scale]);
    }

    public function chat(Request $request)
    {
        $this->requireReady();
        [$requestId, $body, $cost] = $this->input->chat($request);
        $id = $this->budget->reserve($request->attributes->get('assistant.user')->id, $requestId, 'chat', $cost);
        try { $response = $this->provider->chat($body); }
        catch (\Throwable) { $this->budget->finish($id, null); Failure::upstream(); }
        return response()->stream(fn () => app(ChatStream::class)->relay($response, $id), 200,
            ['Content-Type' => 'text/event-stream', 'Cache-Control' => 'no-store', 'X-Accel-Buffering' => 'no']);
    }

    public function transcription(Request $request)
    {
        $this->requireReady();
        [$requestId, $wav, $language, $cost] = $this->input->transcription($request);
        $id = $this->budget->reserve($request->attributes->get('assistant.user')->id, $requestId, 'transcription', $cost);
        try { $result = $this->provider->transcription($wav, $language); }
        catch (\Throwable) { $this->budget->finish($id, null); Failure::upstream(); }
        $this->budget->finish($id, $cost);
        return response()->json($result);
    }

    public function speech(Request $request)
    {
        $this->requireReady();
        [$requestId, $body, $cost] = $this->input->speech($request);
        $id = $this->budget->reserve($request->attributes->get('assistant.user')->id, $requestId, 'speech', $cost);
        try { [$audio, $actual] = app(SpeechAudio::class)->read($this->provider->speech($body)); }
        catch (\Throwable) { $this->budget->finish($id, null); Failure::upstream(); }
        $this->budget->finish($id, $actual);
        return response($audio)->header('Content-Type', $body['response_format'] === 'wav' ? 'audio/wav' : 'audio/mpeg');
    }

    private function requireReady(): void
    {
        if (!$this->budget->ready()) Failure::raise(503, 'assistant_unavailable', 'The Vibyra assistant is temporarily unavailable.');
    }
}
