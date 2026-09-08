<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#f7f8fa">
    <title>Download Vibyra — Your next idea starts here.</title>
    <meta name="description" content="Download the Vibyra Desktop beta. Choose your Windows or Linux installer, get set up, and bring your coding agents into one workspace. Free to download, no account needed.">
    <meta property="og:title" content="Download Vibyra — Your next idea starts here.">
    <meta property="og:description" content="Your agents. Your computer. Your next big idea. Get the Vibyra Desktop beta.">
    <meta property="og:type" content="website">
    <meta property="og:url" content="{{ url('/downloads') }}">
    <meta property="og:image" content="{{ asset('media/marketing/vibyra-social.png') }}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="Vibyra — your agentic coding workspace">
    <meta name="twitter:card" content="summary_large_image">
    <link rel="canonical" href="{{ url('/downloads') }}">
    <link rel="icon" type="image/png" href="{{ asset('vibyra-cobalt.png') }}">
    <link rel="preload" href="{{ asset('fonts/manrope-regular.woff2') }}" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="{{ asset('fonts/manrope-bold.woff2') }}" as="font" type="font/woff2" crossorigin>
    @vite('resources/js/downloads.jsx')
</head>
<body>
    <div id="marketing-root" data-download-url="#installers"></div>
    <noscript><p>Download Vibyra Desktop for Windows or Linux. Enable JavaScript to check current package availability and choose an installer. <a href="/">About Vibyra</a>.</p></noscript>
</body>
</html>
