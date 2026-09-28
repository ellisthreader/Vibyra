<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Concerns\NextTen\TestsChatCoreEntitlements;
use Tests\Feature\Concerns\NextTen\TestsChatCoreRouting;
use Tests\Feature\Concerns\NextTen\TestsChatCorePayloads;
use Tests\TestCase;

class VibyraChatCoreApiTest extends TestCase
{
    use RefreshDatabase;
    use TestsChatCoreEntitlements,
        TestsChatCoreRouting,
        TestsChatCorePayloads;
}
