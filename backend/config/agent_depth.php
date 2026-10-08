<?php

// Narrow compatibility slice: other independently gated depth modules are not shipped here.
return ['secret_guard' => (bool) env('AGENT_SECRET_GUARD_ENABLED', false)];
