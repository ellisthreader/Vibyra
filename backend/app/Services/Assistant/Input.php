<?php
namespace App\Services\Assistant;

use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class Input
{
    public const VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse'];

    public function chat(Request $request): array
    {
        $this->size($request, 80_000);
        $data = $request->validate(['requestId' => 'required|uuid', 'messages' => 'required|array|min:1|max:25',
            'messages.*' => 'required|array:role,content', 'messages.*.role' => ['required', Rule::in(['system', 'user', 'assistant'])],
            'messages.*.content' => 'required|string|max:8200', 'tools' => 'nullable|array|max:32',
            'tools.*' => 'required|array:type,function', 'tools.*.type' => 'required|in:function',
            'tools.*.function' => 'required|array:name,description,parameters,strict',
            'tools.*.function.name' => 'required|string|regex:/^[a-zA-Z0-9_-]{1,64}$/',
            'tools.*.function.description' => 'sometimes|string|max:2000',
            'tools.*.function.parameters' => 'required|array', 'tools.*.function.strict' => 'sometimes|boolean']);
        if (strlen(json_encode($data['messages'])) > 32_000 || strlen(json_encode($data['tools'] ?? [])) > 32_000) {
            Failure::raise(413, 'assistant_payload', 'This conversation is too large. Start a shorter conversation.');
        }
        $body = ['model' => 'gpt-5-mini', 'messages' => $data['messages'], 'max_completion_tokens' => 1600,
            'reasoning_effort' => 'minimal', 'store' => false, 'stream' => true, 'stream_options' => ['include_usage' => true]];
        // Decode the validated original objects: empty JSON Schema properties must remain {}, not [].
        if (!empty($data['tools'])) $body += ['tools' => json_decode($request->getContent())->tools, 'tool_choice' => 'auto'];
        // UTF-8 bytes plus structural overhead conservatively bound tokenized input.
        $reserve = (int) ceil((strlen(json_encode($body)) + 1024) * 0.25 + 1600 * 2);
        return [$data['requestId'], $body, $reserve];
    }

    public function speech(Request $request): array
    {
        $this->size($request, 25_000);
        $data = $request->validate(['requestId' => 'required|uuid', 'text' => 'required|string|max:4000',
            'voice' => ['required', Rule::in(self::VOICES)], 'speed' => 'required|numeric|min:0.25|max:4',
            'format' => 'required|in:mp3,wav', 'instructions' => 'nullable|string|max:400']);
        $body = ['model' => 'gpt-4o-mini-tts', 'input' => $data['text'], 'voice' => $data['voice'],
            'speed' => $data['speed'], 'response_format' => $data['format'], 'stream_format' => 'sse'];
        if (!empty($data['instructions'])) $body['instructions'] = $data['instructions'];
        $reserve = (int) ceil(max(5_000, strlen($data['text']) * 100) / min(1, $data['speed']));
        return [$data['requestId'], $body, $reserve];
    }

    public function transcription(Request $request): array
    {
        $this->size($request, 15_400_000);
        $data = $request->validate(['requestId' => 'required|uuid', 'audio' => 'required|string|max:15400000',
            'language' => 'nullable|string|regex:/^[a-z]{2}$/']);
        $wav = base64_decode($data['audio'], true);
        $seconds = is_string($wav) ? Wav::seconds($wav) : null;
        if ($seconds === null) Failure::raise(422, 'assistant_audio', 'Use a mono PCM WAV recording between 0.4 and 120 seconds.');
        return [$data['requestId'], $wav, $data['language'] ?? null, (int) ceil($seconds) * 100];
    }

    private function size(Request $request, int $maximum): void
    {
        if (!$request->isJson()) Failure::raise(422, 'assistant_payload', 'Send a JSON request.');
        if (strlen($request->getContent()) > $maximum) Failure::raise(413, 'assistant_payload', 'This request is too large.');
    }
}
