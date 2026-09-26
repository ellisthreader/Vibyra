<!DOCTYPE html>
<html lang="en">
<head>
    @php
        $pages = [
            'login' => ['Log in to Vibyra', 'Sign in to return to your projects, agents and Vibyra membership.'],
            'signup' => ['Create your Vibyra account', 'Create an account for your Vibyra projects and membership.'],
            'billing' => ['Vibyra membership plans', 'Compare current membership plans and Vibyra cloud AI credits.'],
            'billing/success' => ['Checking your membership | Vibyra', 'Checking your Vibyra membership after checkout.'],
            'billing/cancel' => ['Checkout cancelled | Vibyra', 'Return to Vibyra membership options after a cancelled checkout.'],
            'account' => ['Your account | Vibyra', 'Manage your Vibyra account and membership.'],
            'owner/login' => ['Owner sign in | Vibyra', 'Private owner sign in.'],
            'owner' => ['Owner overview | Vibyra', 'Private owner analytics.'],
        ];
        [$pageTitle, $pageDescription] = $pages[request()->path()] ?? ['Vibyra account', 'Your projects, agents and membership in one place.'];
    @endphp
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <meta name="theme-color" content="#0e0f12">
    <title>{{ $pageTitle }}</title>
    <meta name="description" content="{{ $pageDescription }}">
    @if(request()->is('owner*'))
        <meta name="robots" content="noindex,nofollow">
    @endif
    @if(request()->is('owner/login') && \App\Http\Middleware\LocalOwnerAccess::available(request()))
        <meta name="local-owner-access" content="1">
    @endif
    <link rel="icon" type="image/png" href="{{ asset('vibyra-cobalt.png') }}">
    <link rel="preload" href="{{ asset('fonts/manrope-regular.woff2') }}" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="{{ asset('fonts/manrope-bold.woff2') }}" as="font" type="font/woff2" crossorigin>
    @vite(['resources/css/portal.css', 'resources/js/portal.jsx'])
</head>
<body>
    <div id="portal-root"></div>
</body>
</html>
