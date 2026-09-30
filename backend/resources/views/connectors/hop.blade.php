<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <meta name="color-scheme" content="light dark">
    <title>{{ $title }} · Vibyra</title>
    <style nonce="{{ $nonce }}">
        :root { --bg: #f4f6f9; --card: #ffffff; --ink: #171a21; --muted: #596273; --line: #dce1e9; --soft: #eef1f7; --accent: #315ee8; }
        @media (prefers-color-scheme: dark) {
            :root { --bg: #101217; --card: #171a21; --ink: #f3f4f8; --muted: #a6adba; --line: #2a2f3a; --soft: #22262f; --accent: #4270e8; }
        }
        * { box-sizing: border-box; }
        body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; background: var(--bg); color: var(--ink);
            font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
        main { width: min(26rem, 100%); background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 28px 24px; }
        .brand { margin: 0 0 16px; color: var(--accent); font-weight: 650; }
        h1 { margin: 0 0 12px; font-size: 1.45rem; line-height: 1.25; letter-spacing: -.02em; overflow-wrap: anywhere; }
        p { margin: 0 0 22px; color: var(--muted); }
        button { display: block; width: 100%; min-height: 48px; border: 0; border-radius: 12px; padding: 12px 20px; font: inherit; font-weight: 600; cursor: pointer; }
        .go { background: var(--accent); color: #fff; }
        .no { margin-top: 10px; background: var(--soft); color: var(--ink); }
        button:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
    </style>
</head>
<body>
<main>
    <p class="brand">Vibyra</p>
    @if ($hop)
        <h1>Connect {{ $hop['provider'] }} to the Vibyra account <strong>{{ $hop['account'] }}</strong>?</h1>
        <p>Only continue if this is your account and you started this from the Vibyra app. If someone sent you this link, choose “This isn't my account”.</p>
        <form method="post">
            <input type="hidden" name="_token" value="{{ $token }}">
            <button class="go" type="submit" name="choice" value="continue">Continue</button>
            <button class="no" type="submit" name="choice" value="cancel">This isn't my account</button>
        </form>
    @else
        <h1>{{ $title }}</h1>
        <p>{{ $detail }}</p>
    @endif
</main>
</body>
</html>
