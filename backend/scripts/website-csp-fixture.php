<?php
// Read-only rendering fixture. No account, database or external services are used.
if (getenv('APP_ENV') !== 'testing') exit(64);
require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$origin = $argv[1] ?? '';
if (! preg_match('#^http://127\.0\.0\.1:[0-9]+$#D', $origin)) exit(64);
$pages = ['/' => 'marketing', '/login' => 'portal', '/legal/privacy' => 'legal.privacy', '/remote/verify' => 'remote.verify'];
$output = [];
foreach ($pages as $path => $view) {
    $request = Illuminate\Http\Request::create($origin.$path);
    $request->setLaravelSession($app['session']->driver('array'));
    $app->instance('request', $request);
    Illuminate\Support\Facades\URL::forceRootUrl($origin);
    $response = (new App\Http\Middleware\SecurityHeaders)->handle($request, function () use ($view, $path) {
        $response = response()->view($view);
        if ($path === '/remote/verify') $response->header('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
        return $response;
    });
    $output[$path] = ['html' => $response->getContent(), 'csp' => $response->headers->get('Content-Security-Policy')];
}
echo json_encode($output, JSON_THROW_ON_ERROR);
