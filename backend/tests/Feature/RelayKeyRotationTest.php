<?php

namespace Tests\Feature;

use App\Services\Remote\RelayTokens;
use Tests\TestCase;

class RelayKeyRotationTest extends TestCase
{
    public function test_previous_key_has_a_bounded_overlap_and_unknown_ids_are_rejected(): void
    {
        $old = str_repeat('o', 32);
        $new = str_repeat('n', 32);
        config(['remote.relay_signing_secret' => $old, 'remote.relay_signing_key_id' => 'old']);
        $tokens = app(RelayTokens::class);
        $token = $tokens->mint(['role' => 'host', 'hostId' => str_repeat('a', 64), 'userId' => '1'], 300);
        config(['remote.relay_signing_secret' => $new, 'remote.relay_signing_key_id' => 'new',
            'remote.relay_signing_previous_secret' => $old, 'remote.relay_signing_previous_key_id' => 'old',
            'remote.relay_signing_previous_until' => time() + 300]);
        $this->assertNotNull($tokens->verify($token));
        config(['remote.relay_signing_previous_key_id' => 'unrelated']);
        $this->assertNull($tokens->verify($token));
        config(['remote.relay_signing_previous_key_id' => 'old', 'remote.relay_signing_previous_until' => time() - 1]);
        $this->assertNull($tokens->verify($token, true));
    }
}
