<?php

namespace Tests\Feature;

use App\Services\VibyraDesktopState;
use App\Services\Referrals\ReferralService;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use GuzzleHttp\Psr7\Response as GuzzleResponse;
use Tests\TestCase;

class VibyraChatMemoryApiTest extends TestCase
{
    use RefreshDatabase;
    public function test_chat_includes_project_file_map_for_folder_context(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        Http::fake([
            'https://openrouter.ai/api/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => ['content' => 'Auth creates users through the action layer.'],
                ]],
            ]),
        ]);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex@example.com',
            'password' => 'secret123',
        ])->json('token');

        $this->postJson('/api/chat', [
            'mode' => 'chat',
            'model' => 'gpt-5.4-mini',
            'project' => 'ReactLaravel',
            'projectFiles' => [
                ['path' => 'app/Actions/Fortify/CreateNewUser.php', 'language' => 'php', 'loaded' => false],
                ['path' => 'resources/css/theme.css', 'language' => 'css', 'loaded' => true, 'snippet' => ':root { --brand: #8E3CFF; --surface: #0B0D17; }'],
                ['path' => 'routes/web.php', 'language' => 'php', 'loaded' => false],
                ['path' => 'resources/js/Pages/Auth/Register.jsx', 'language' => 'jsx', 'loaded' => false],
            ],
            'prompt' => 'How does signup work in this folder?',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('reply', 'Auth creates users through the action layer.');

        Http::assertSent(function ($request) {
            $messages = $request['messages'];
            $user = $messages[array_key_last($messages)]['content'];

            return str_contains($messages[0]['content'], 'Use the project/folder context first')
                && str_contains($messages[0]['content'], 'instead of telling the user to run shell commands')
                && str_contains($user, 'Project: ReactLaravel')
                && str_contains($user, "Project files:\n- app/Actions/Fortify/CreateNewUser.php")
                && str_contains($user, '- resources/css/theme.css (css loaded)')
                && str_contains($user, '  :root { --brand: #8E3CFF; --surface: #0B0D17; }')
                && str_contains($user, 'Do not respond with bash, grep, find, rg, npm, or terminal commands')
                && str_contains($user, '- routes/web.php')
                && ! str_contains($user, "\n\nFile app/Actions/Fortify/CreateNewUser.php:");
        });
    }

    public function test_chat_reuses_relevant_learning_memory(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        $sentMessages = [];
        Http::fake(function ($request) use (&$sentMessages) {
            $sentMessages[] = $request['messages'];

            return Http::response([
                'choices' => [[
                    'message' => ['content' => count($sentMessages) === 1
                        ? 'The fix was to inline the script and avoid local preview files.'
                        : 'Use the previous inline-script fix here.'],
                ]],
            ]);
        });

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex-learning@example.com',
            'password' => 'secret123',
        ])->json('token');
        $headers = ['Authorization' => "Bearer {$token}"];

        $this->postJson('/api/chat', [
            'mode' => 'chat',
            'model' => 'gpt-5.4-mini',
            'project' => 'Preview App',
            'prompt' => 'Fix the blank preview error caused by a local script file.',
        ], $headers)->assertOk();

        $this->assertDatabaseCount('chat_learning_memories', 1);

        $this->postJson('/api/chat', [
            'mode' => 'chat',
            'model' => 'gpt-5.4-mini',
            'project' => 'Preview App',
            'prompt' => 'The preview is blank again with a script error, how do we fix it?',
        ], $headers)->assertOk();

        $secondUserMessage = $sentMessages[1][array_key_last($sentMessages[1])]['content'];
        $this->assertStringContainsString('Relevant past Vibyra learning:', $secondUserMessage);
        $this->assertStringContainsString('Fix the blank preview error caused by a local script file.', $secondUserMessage);
        $this->assertStringContainsString('inline the script', $secondUserMessage);
    }

    public function test_colour_scheme_question_replaces_shell_commands_with_direct_answer(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        Http::fake([
            'https://openrouter.ai/api/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => ['content' => "```bash\nrg -n \"#[0-9a-fA-F]{3,8}|rgba?\\(\" src\n```"],
                ]],
            ]),
        ]);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex-colour@example.com',
            'password' => 'secret123',
        ])->json('token');

        $response = $this->postJson('/api/chat', [
            'mode' => 'chat',
            'model' => 'gpt-5.4-mini',
            'project' => 'Vibyra',
            'projectFiles' => [
                ['path' => 'src/styles/theme.ts', 'language' => 'ts', 'loaded' => true, 'snippet' => 'export const colors = { primary: "#8E3CFF", bg: "#0B0D17", text: "#E7E3EF" };'],
                ['path' => 'src/screens/workspace/styles/part20.ts', 'language' => 'ts', 'loaded' => true, 'snippet' => 'color: "#DDBBFF"; backgroundColor: "rgba(176, 132, 255, 0.18)";'],
            ],
            'prompt' => 'What is the colour scheme?',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk();

        $reply = (string) $response->json('reply');
        $this->assertStringContainsString('The colour scheme appears to be', $reply);
        $this->assertStringContainsString('#8E3CFF', $reply);
        $this->assertStringContainsString('#0B0D17', $reply);
        $this->assertStringNotContainsString('rg -n', $reply);
        $this->assertStringNotContainsString('```bash', $reply);
    }

    public function test_build_preview_reply_replaces_localhost_guidance_with_phone_preview_copy(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        Http::fake([
            'https://openrouter.ai/api/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => ['content' => 'Open http://localhost:8000 in your browser. <vibyra-app title="Todo"><!doctype html><html><body>Todo</body></html></vibyra-app>'],
                ]],
            ]),
        ]);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex-phone@example.com',
            'password' => 'secret123',
        ])->json('token');

        $this->postJson('/api/chat', [
            'mode' => 'build',
            'model' => 'gpt-5.4-mini',
            'project' => 'Todo App',
            'prompt' => 'Create a todo app',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('reply', 'Ready to preview on your phone. Tap the Live Preview card below to open it in Vibyra.')
            ->assertJsonPath('app.title', 'Todo');
    }
}
