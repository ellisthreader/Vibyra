<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>Vibyra account</title>
    <meta name="description" content="Sign in, manage your Vibyra membership, and download Vibyra Desktop for Windows or Linux.">
    <link rel="icon" type="image/png" href="{{ asset('vibyra-mark.png') }}">
    @vite(['resources/css/portal.css', 'resources/js/portal.jsx'])
</head>
<body>
    <div id="portal-root"></div>
</body>
</html>
