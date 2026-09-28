<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>Just a moment | Vibyra</title>
    <link rel="icon" type="image/png" href="{{ asset('vibyra-cobalt.png') }}">
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
    <style>
        @font-face { font-family: Manrope; src: url('/fonts/manrope-regular.woff2') format('woff2'); font-weight: 400 600; font-display: swap; }
        @font-face { font-family: Manrope; src: url('/fonts/manrope-bold.woff2') format('woff2'); font-weight: 650 800; font-display: swap; }
        :root {
            color-scheme: dark;
            --bg: #0b0d12;
            --card: #13161d;
            --line: #252a35;
            --ink: #eef1f6;
            --muted: #8d95a6;
            --accent: #4f7bff;
            --danger: #ff8a8a;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 24px 16px;
            background: radial-gradient(120% 80% at 50% 0%, #16203d 0%, var(--bg) 60%);
            color: var(--ink);
            font-family: Manrope, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        main {
            width: 100%;
            max-width: 420px;
            padding: 36px 28px 28px;
            border: 1px solid var(--line);
            border-radius: 20px;
            background: var(--card);
            text-align: center;
            box-shadow: 0 30px 80px rgba(0, 0, 0, .45);
        }
        .mark { width: 48px; height: 48px; border-radius: 12px; }
        h1 { margin: 20px 0 8px; font-size: 22px; font-weight: 750; letter-spacing: -.01em; }
        p { margin: 0; color: var(--muted); font-size: 15px; line-height: 1.55; }
        .widget { display: flex; justify-content: center; min-height: 65px; margin: 26px 0 6px; }
        .error { margin-top: 14px; color: var(--danger); font-size: 14px; }
        .fine { margin-top: 22px; font-size: 12px; }
        .fine a { color: var(--muted); }
        noscript p { margin-top: 16px; color: var(--danger); }
    </style>
</head>
<body>
    <main>
        <img class="mark" src="{{ asset('vibyra-cobalt.png') }}" alt="Vibyra">
        <h1>Checking you're human</h1>
        <p>This quick check keeps bots off Vibyra. You'll only see it once.</p>

        <form id="human-check" method="POST" action="/web-api/human-check">
            @csrf
            <input type="hidden" name="return_to" value="{{ $returnTo }}">
            <div class="widget">
                <div class="cf-turnstile"
                    data-sitekey="{{ $siteKey }}"
                    data-theme="dark"
                    data-callback="vibyraHumanPassed"></div>
            </div>
        </form>

        @if ($failed)
            <p class="error" role="alert">That check didn't go through. Please try again.</p>
        @endif
        <noscript><p>Turn on JavaScript to continue to Vibyra.</p></noscript>

        <p class="fine">Protected by Cloudflare Turnstile · <a href="/legal/privacy">Privacy</a></p>
    </main>
    <script>
        function vibyraHumanPassed() {
            document.getElementById('human-check').submit();
        }
    </script>
</body>
</html>
