<?php
require __DIR__.'/../../../vendor/autoload.php';
$app = require __DIR__.'/../../../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
abort_unless($app->environment('testing') && config('database.default') === 'sqlite', 409);
$user = App\Models\User::factory()->create(['email' => 'mcp-sdk@example.test']);
[, $key] = app(App\Services\Platform\ApiKeys::class)->create($user->id, 'Disposable SDK test', ['runs:read', 'projects:read']);
echo $key;
