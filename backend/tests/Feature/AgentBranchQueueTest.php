<?php

namespace Tests\Feature;

use App\Jobs\PublishAgentBranch;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AgentBranchQueueTest extends TestCase
{
    use RefreshDatabase;

    public function test_branch_upload_is_encrypted_in_the_database_queue(): void
    {
        config(['app.key' => 'base64:'.base64_encode(str_repeat('x', 32)),
            'vibes.queue_connection' => 'database']);
        $secret = 'PRIVATE-SOURCE-CONTENT-FIXTURE';
        PublishAgentBranch::dispatch(
            '123e4567-e89b-12d3-a456-426614174000',
            '123e4567-e89b-12d3-a456-426614174001',
            ['files' => [['contentBase64' => base64_encode($secret)]], 'fixture' => $secret],
        );
        $payload = DB::table('jobs')->value('payload');
        $this->assertIsString($payload);
        $this->assertStringNotContainsString($secret, $payload);
        $this->assertStringNotContainsString(base64_encode($secret), $payload);
        $this->assertSame('vibes', DB::table('jobs')->value('queue'));
        $this->assertSame(1, (int) (json_decode($payload, true)['maxTries'] ?? 0));
    }
}
