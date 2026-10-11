<?php

// Narrow compatibility slice: other independently gated depth modules are not shipped here.
return ['secret_guard' => (bool) env('AGENT_SECRET_GUARD_ENABLED', false),
    'rules' => (bool) env('AGENT_RULES_ENABLED', false),
    'rule_default_days' => 30, 'rule_max_days' => 365, 'max_rules' => 100];
