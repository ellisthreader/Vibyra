<?php

/*
 * Agent V2 Phase 7 (rebuild Stage 4): browser tools on the leased Mac. A teammate
 * gets them only through a browser grant (allowed site origins chosen by the person)
 * and only on a Mac runtime that declares `capabilities.browserTools`. Off by default.
 */
return [
    'enabled' => (bool) env('AGENTS_V2_BROWSER_ENABLED', false),
    // Largest Mac receipt (snapshot/page text) the server stores for one browser action.
    'max_receipt_bytes' => 30000,
];
