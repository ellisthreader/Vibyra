<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Concerns\NextTen\TestsChatStreamValidation;
use Tests\Feature\Concerns\NextTen\TestsChatStreamRouting;
use Tests\Feature\Concerns\NextTen\TestsChatStreamResearch;
use Tests\TestCase;

class VibyraChatStreamApiTest extends TestCase
{
    use RefreshDatabase;
    use TestsChatStreamValidation,
        TestsChatStreamRouting,
        TestsChatStreamResearch;
}
