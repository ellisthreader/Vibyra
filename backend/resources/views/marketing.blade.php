<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#f7f8fa">
    <title>Vibyra — Big ideas. Meet your building space.</title>
    <meta name="description" content="An agentic coding workspace for vibecoders and developers. Bring your coding agents, local previews, Git review, and project memory together. Meet the upcoming phone companion.">
    <meta property="og:title" content="Vibyra — Big ideas. Meet your building space.">
    <meta property="og:description" content="The agentic coding workspace for your next big idea. Bring your agents. Build, preview, and make it yours.">
    <meta property="og:type" content="website">
    <meta property="og:url" content="{{ url('/') }}">
    <meta property="og:image" content="{{ asset('media/marketing/vibyra-social.png') }}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="Vibyra — your agentic coding workspace">
    <meta name="twitter:card" content="summary_large_image">
    <link rel="canonical" href="{{ url('/') }}">
    <link rel="icon" type="image/png" href="{{ asset('vibyra-cobalt.png') }}">
    <link rel="preload" href="{{ asset('fonts/manrope-regular.woff2') }}" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="{{ asset('fonts/manrope-bold.woff2') }}" as="font" type="font/woff2" crossorigin>
    @vite(['resources/css/marketing.css', 'resources/js/marketing.jsx'])
</head>
<body>
    <div id="marketing-root" data-download-url="{{ url('/downloads') }}"></div>
    <noscript><p>Vibyra brings your coding agents, local previews, and project memory into one desktop workspace. <a href="/downloads">Download Vibyra Desktop</a>. Enable JavaScript to explore the interactive walkthrough.</p></noscript>
</body>
</html>
