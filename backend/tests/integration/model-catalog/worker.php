<?php

require __DIR__.'/../../../vendor/autoload.php';
$app = require __DIR__.'/../../../bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();
config(['model_catalog.enabled' => true, 'model_catalog.publish' => true,
    'model_catalog.signing_key' => getenv('CATALOG_TEST_SIGNING_KEY'), 'model_catalog.probe_daily_micro' => 100]);
if ($argv[1] === 'publish') {
    echo app(\App\Services\ModelCatalog\Publisher::class)->publish();
} else {
    echo app(\App\Services\ModelCatalog\Attempts::class)->claim('openai/gpt-99-'.$argv[2],
        str_repeat('a', 64), 'probe', 60) ?? 'capped';
}
