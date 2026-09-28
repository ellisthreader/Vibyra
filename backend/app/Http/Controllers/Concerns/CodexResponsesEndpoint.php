<?php

namespace App\Http\Controllers\Concerns;

trait CodexResponsesEndpoint
{
    use CodexChatCompletionsCompatibility,
        CodexResponsesStreaming,
        CodexResponsesRequest,
        CodexResponsesInputNormalization,
        CodexResponsesModelSelection,
        CodexResponsesErrors;
}
