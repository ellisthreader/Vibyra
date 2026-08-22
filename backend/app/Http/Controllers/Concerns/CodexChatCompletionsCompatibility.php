<?php

namespace App\Http\Controllers\Concerns;

trait CodexChatCompletionsCompatibility
{
    use CodexChatTransport,
        CodexChatPayloads,
        CodexChatResponse;
}
