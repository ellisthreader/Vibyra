<?php

namespace App\Services\Concerns;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;

trait OpenAiStreaming
{
    private function streamOpenAiResponse(array $project, string $prompt, string $model, string $reasoningEffort): string
    {
        $context = $this->projectContext($project);
        $payload = [
            'model' => $model,
            'reasoning' => [
                'effort' => $reasoningEffort,
            ],
            'input' => [[
                'role' => 'user',
                'content' => [[
                    'type' => 'input_text',
                    'text' => implode("\n\n", [
                        'You are Vibyra, an AI software agent connected to a desktop project.',
                        'Build into the actual project files the user can run or preview, not into a detached explanation.',
                        'If the user asks for an app, website, page, or visual feature and the project has no obvious web entry, create or update a phone-viewable index.html in the project root.',
                        'When files should change, return the files to write in this exact format and keep paths relative to the project root:',
                        '```json',
                        '{"files":[{"path":"relative/path.txt","content":"complete file contents"}]}',
                        '```',
                        'You may add a short explanation before or after the JSON, but the JSON must contain every file that should be created or replaced.',
                        'Project: '.$project['name'],
                        'Project path: '.$project['path'],
                        'Project context:',
                        $context,
                        'User request:',
                        $prompt,
                    ]),
                ]],
            ]],
            'stream' => true,
        ];

        $body = json_encode($payload);
        $buffer = '';
        $responseText = '';
        $lineBuffer = '';
        $error = null;
        $lastProgress = 12;
        $lastProgressWriteAt = 0.0;

        $handle = curl_init('https://api.openai.com/v1/responses');
        curl_setopt_array($handle, [
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer '.env('OPENAI_API_KEY'),
                'Content-Type: application/json',
            ],
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_RETURNTRANSFER => false,
            CURLOPT_TIMEOUT => 180,
            CURLOPT_WRITEFUNCTION => function ($curl, string $chunk) use (&$buffer, &$responseText, &$lineBuffer, &$error, &$lastProgress, &$lastProgressWriteAt) {
                $buffer .= $chunk;

                while (($position = strpos($buffer, "\n\n")) !== false) {
                    $rawEvent = substr($buffer, 0, $position);
                    $buffer = substr($buffer, $position + 2);

                    foreach (explode("\n", $rawEvent) as $line) {
                        if (! str_starts_with($line, 'data: ')) {
                            continue;
                        }

                        $data = substr($line, 6);
                        if ($data === '[DONE]') {
                            continue;
                        }

                        $event = json_decode($data, true);
                        if (! is_array($event)) {
                            continue;
                        }

                        if (($event['type'] ?? '') === 'response.error') {
                            $error = $event['error']['message'] ?? 'OpenAI streaming error';
                            $this->recordEvent('OpenAI', $error, 'error');
                            continue;
                        }

                        if (($event['type'] ?? '') === 'response.output_text.delta') {
                            $delta = (string) ($event['delta'] ?? '');
                            if ($delta === '') {
                                continue;
                            }

                            $responseText .= $delta;
                            $lineBuffer .= $delta;
                            $progress = min(92, 12 + (int) floor(sqrt(strlen($responseText)) * 2.4));
                            $now = microtime(true);

                            if ($progress > $lastProgress && ($progress - $lastProgress >= 4 || $now - $lastProgressWriteAt >= 0.75)) {
                                $state = $this->read();
                                if (! empty($state['activeAgentRun'])) {
                                    $state['activeAgentRun']['progress'] = $progress;
                                    $state['activeAgentRun']['updatedAt'] = now()->toISOString();
                                    $this->write($state);
                                }

                                $lastProgress = $progress;
                                $lastProgressWriteAt = $now;
                            }

                            while (($newline = strpos($lineBuffer, "\n")) !== false) {
                                $lineText = trim(substr($lineBuffer, 0, $newline));
                                $lineBuffer = substr($lineBuffer, $newline + 1);

                                if ($lineText !== '') {
                                    $this->recordEvent('OpenAI', Str::limit($lineText, 220), 'info');
                                }
                            }

                            if (strlen($lineBuffer) > 180) {
                                $this->recordEvent('OpenAI', Str::limit($lineBuffer, 220), 'info');
                                $lineBuffer = '';
                            }
                        }
                    }
                }

                return strlen($chunk);
            },
        ]);

        $ok = curl_exec($handle);
        $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        $curlError = curl_error($handle);
        curl_close($handle);

        if ($lineBuffer !== '') {
            $this->recordEvent('OpenAI', Str::limit(trim($lineBuffer), 220), 'info');
        }

        if (! $ok || $status >= 400 || $error) {
            $message = $error ?: ($curlError ?: 'OpenAI request failed with HTTP '.$status);
            $this->recordEvent('OpenAI', $message, 'error');
            abort(response()->json(['ok' => false, 'error' => $message], 502));
        }

        $this->recordEvent('OpenAI', 'Generation complete', 'success');

        return trim($responseText) ?: 'OpenAI returned no text.';
    }
}
