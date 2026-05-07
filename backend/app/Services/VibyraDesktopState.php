<?php

namespace App\Services;

use App\Services\Concerns\AgentExecution;
use App\Services\Concerns\AgentLocking;
use App\Services\Concerns\CommandRunner;
use App\Services\Concerns\FileDiscovery;
use App\Services\Concerns\GeneratedFileHandling;
use App\Services\Concerns\OpenAiStreaming;
use App\Services\Concerns\PairingState;
use App\Services\Concerns\ProjectDiscovery;
use App\Services\Concerns\ProjectFileState;
use App\Services\Concerns\ProjectPreview;
use App\Services\Concerns\StatePersistence;

class VibyraDesktopState
{
    use AgentExecution;
    use AgentLocking;
    use CommandRunner;
    use FileDiscovery;
    use GeneratedFileHandling;
    use OpenAiStreaming;
    use PairingState;
    use ProjectDiscovery;
    use ProjectFileState;
    use ProjectPreview;
    use StatePersistence;

    private const AGENT_COOLDOWN_SECONDS = 8;
    private const DUPLICATE_PROMPT_WINDOW_SECONDS = 120;

    private string $statePath;

    public function __construct()
    {
        $this->statePath = storage_path('app/vibyra/state.json');
        $this->ensureState();
    }
}
