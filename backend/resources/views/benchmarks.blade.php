<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#f7f8fa">
    <title>AI Model Benchmarks — Vibyra</title>
    <meta name="description" content="Compare today's leading AI models on intelligence, coding, price and speed. Clear, interactive charts that show which model is best for the job.">
    <meta property="og:title" content="AI Model Benchmarks — Vibyra">
    <meta property="og:description" content="Which AI model is best, and what does it cost? Intelligence, coding, price and speed in one clear view.">
    <meta property="og:type" content="website">
    <meta property="og:url" content="{{ url('/benchmarks') }}">
    <meta property="og:image" content="{{ asset('media/marketing/vibyra-social.png') }}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta name="twitter:card" content="summary_large_image">
    <link rel="canonical" href="{{ url('/benchmarks') }}">
    <link rel="icon" type="image/png" href="{{ asset('vibyra-cobalt.png') }}">
    <link rel="preload" href="{{ asset('fonts/manrope-regular.woff2') }}" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="{{ asset('fonts/manrope-bold.woff2') }}" as="font" type="font/woff2" crossorigin>
    @vite('resources/js/benchmarks.jsx')
</head>
<body>
    <div id="marketing-root" data-download-url="/downloads"></div>
    <noscript><p>Enable JavaScript to explore the AI model benchmarks. <a href="/">About Vibyra</a>.</p></noscript>
</body>
</html>
