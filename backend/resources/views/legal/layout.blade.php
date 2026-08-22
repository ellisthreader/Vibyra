<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>@yield('title') | Vibyra</title>
    <meta name="description" content="@yield('description')">
    <link rel="icon" type="image/png" href="{{ asset('vibyra-cobalt.png') }}">
    <style>
        :root {
            color-scheme: light;
            --accent: #315ee8;
            --accent-dark: #2449b8;
            --ink: #171a21;
            --muted: #596273;
            --line: #dce1e9;
            --soft: #f4f6f9;
        }
        * { box-sizing: border-box; }
        body {
            background: #ffffff;
            color: var(--ink);
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            line-height: 1.65;
            margin: 0;
        }
        a { color: var(--accent-dark); }
        a:focus-visible {
            outline: 3px solid rgba(49, 94, 232, .28);
            outline-offset: 3px;
        }
        header {
            border-bottom: 1px solid var(--line);
            position: sticky;
            top: 0;
            background: rgba(255, 255, 255, .96);
            z-index: 2;
        }
        .bar {
            align-items: center;
            display: flex;
            gap: 24px;
            justify-content: space-between;
            margin: 0 auto;
            max-width: 1040px;
            min-height: 64px;
            padding: 10px 24px;
        }
        .brand {
            align-items: center;
            color: var(--ink);
            display: inline-flex;
            font-size: 19px;
            font-weight: 800;
            gap: 10px;
            text-decoration: none;
        }
        .brand img { height: 32px; width: 32px; }
        nav { display: flex; gap: 20px; }
        nav a { font-size: 14px; font-weight: 700; text-decoration: none; }
        main {
            margin: 0 auto;
            max-width: 820px;
            padding: 64px 24px 80px;
        }
        .eyebrow {
            color: var(--accent-dark);
            font-size: 13px;
            font-weight: 800;
            text-transform: uppercase;
        }
        h1 {
            font-size: clamp(36px, 6vw, 56px);
            line-height: 1.08;
            margin: 8px 0 16px;
        }
        .lead { color: var(--muted); font-size: 19px; max-width: 700px; }
        .updated {
            border-bottom: 1px solid var(--line);
            color: var(--muted);
            font-size: 14px;
            margin: 28px 0 42px;
            padding-bottom: 24px;
        }
        section { margin-top: 38px; }
        h2 { font-size: 24px; line-height: 1.25; margin: 0 0 12px; }
        h3 { font-size: 17px; margin: 22px 0 8px; }
        p, li { color: #303744; }
        ul { padding-left: 24px; }
        li + li { margin-top: 7px; }
        .notice {
            background: var(--soft);
            border-left: 4px solid var(--accent);
            padding: 16px 18px;
        }
        footer {
            border-top: 1px solid var(--line);
            color: var(--muted);
            font-size: 14px;
            padding: 26px 24px;
            text-align: center;
        }
        @media (max-width: 600px) {
            .bar { align-items: flex-start; flex-direction: column; gap: 8px; }
            header { position: static; }
            main { padding-top: 42px; }
            nav { gap: 16px; }
        }
    </style>
</head>
<body>
    <header>
        <div class="bar">
            <a class="brand" href="{{ url('/') }}">
                <img src="{{ asset('vibyra-cobalt.png') }}" alt="">
                <span>Vibyra</span>
            </a>
            <nav aria-label="Legal policies">
                <a href="{{ route('legal.privacy') }}">Privacy</a>
                <a href="{{ route('legal.terms') }}">Terms</a>
            </nav>
        </div>
    </header>
    <main>
        @yield('content')
    </main>
    <footer>
        &copy; {{ now()->year }} Vibyra. Questions: <a href="mailto:support@vibyra.app">support@vibyra.app</a>
    </footer>
</body>
</html>
