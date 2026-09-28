<?php

namespace App\Http\Controllers\Concerns;

trait NativeTerminalEndpoint
{
    use NativeTerminalProtocol,
        NativeTerminalStreaming,
        NativeTerminalRoutes,
        NativeTerminalDispatch,
        NativeTerminalResponses,
        NativeTerminalErrors;
}
