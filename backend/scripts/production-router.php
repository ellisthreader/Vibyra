<?php

// PHP's built-in static server discards router headers on `return false`.
// Symfony preserves range/HEAD/conditional requests while applying the same
// basic browser protections to build-owned public assets.
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\Request;

require_once dirname(__DIR__).'/vendor/autoload.php';
$public = realpath(dirname(__DIR__).'/public');
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
$safe = !str_contains($path, "\0") && !str_contains($path, '\\')
    && !preg_match('~(?:^|/)\.~', $path);
$file = $safe ? realpath($public.'/'.$path) : false;
if ($file && is_dir($file)) $file = realpath($file.'/index.html');
$extension = $file ? strtolower(pathinfo($file, PATHINFO_EXTENSION)) : '';
if ($file && is_file($file) && str_starts_with($file, $public.DIRECTORY_SEPARATOR)
    && !in_array($extension, ['php', 'phtml', 'phar'], true)) {
    $request = Request::createFromGlobals();
    $types = ['js' => 'application/javascript', 'mjs' => 'application/javascript', 'css' => 'text/css',
        'svg' => 'image/svg+xml', 'json' => 'application/json', 'wasm' => 'application/wasm',
        'woff2' => 'font/woff2', 'woff' => 'font/woff', 'ttf' => 'font/ttf'];
    $headers = ['X-Content-Type-Options' => 'nosniff', 'X-Frame-Options' => 'SAMEORIGIN',
        'Referrer-Policy' => 'strict-origin-when-cross-origin',
        'Permissions-Policy' => 'camera=(), microphone=(self), geolocation=(), payment=(self), usb=()',
        'Content-Security-Policy' => "object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
        'Cache-Control' => 'public, max-age=3600'];
    if (isset($types[$extension])) $headers['Content-Type'] = $types[$extension];
    if ($request->isSecure() || strtolower($request->headers->get('X-Forwarded-Proto', '')) === 'https') {
        $headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
    }
    $response = new BinaryFileResponse($file, 200, $headers, true);
    $response->setAutoLastModified();
    $response->isNotModified($request);
    $response->prepare($request)->send();
    return;
}

require $public.'/index.php';
