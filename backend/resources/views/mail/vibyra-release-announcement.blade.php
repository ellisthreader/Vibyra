<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>We fixed Vibyra terminal lag</title>
</head>
<body style="margin:0;background:#0e0f12;color:#f7f8fb;font-family:Inter,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;color:transparent;">We’re sorry about the terminal lag, spacing and typing problems. Vibyra {{ $version }} fixes them.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0e0f12;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#17191f;border:1px solid #2a2e38;border-radius:20px;overflow:hidden;">
        <tr><td style="padding:26px 32px 18px;border-bottom:1px solid #2a2e38;">
          <table role="presentation" cellspacing="0" cellpadding="0"><tr>
            <td><img src="https://vibyra-production.up.railway.app/vibyra-cobalt.png" width="34" height="34" alt="Vibyra" style="display:block;border:0;"></td>
            <td style="padding-left:12px;"><strong style="font-size:19px;letter-spacing:-.2px;">Vibyra</strong><br><span style="font-size:12px;color:#9299a8;">Native AI workspace</span></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:38px 32px 14px;">
          <span style="display:inline-block;padding:6px 10px;background:#1f2d52;color:#8fb1ff;border-radius:999px;font-size:12px;font-weight:700;">IMPORTANT UPDATE · {{ $version }}</span>
          <h1 style="margin:18px 0 12px;font-size:34px;line-height:1.12;letter-spacing:-1px;">We fixed the terminal lag.</h1>
          <p style="margin:0 0 14px;color:#b7bdc9;font-size:16px;line-height:1.7;">Hi {{ $firstName }}, we’re sorry. Recent Vibyra releases caused incorrect terminal spacing, delayed-looking typing and excessive CPU usage for some people. That wasn’t the experience we intended.</p>
          <p style="margin:0;color:#b7bdc9;font-size:16px;line-height:1.7;">We traced the regressions to terminal rendering and font startup, fixed the underlying causes, and tested the repaired build in the native app under sustained input and output.</p>
        </td></tr>
        <tr><td style="padding:20px 32px 26px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td width="50%" valign="top" style="padding:14px 12px 14px 0;border-top:1px solid #2a2e38;"><strong style="color:#8fb1ff;">Correct spacing</strong><br><span style="color:#9299a8;font-size:14px;line-height:1.55;">The bundled terminal font is ready before character cells are measured.</span></td>
              <td width="50%" valign="top" style="padding:14px 0 14px 12px;border-top:1px solid #2a2e38;"><strong style="color:#8fb1ff;">Responsive typing</strong><br><span style="color:#9299a8;font-size:14px;line-height:1.55;">Fast keyboard, paste and dictation input stays ordered without per-key layout work.</span></td>
            </tr>
            <tr>
              <td width="50%" valign="top" style="padding:14px 12px 0 0;border-top:1px solid #2a2e38;"><strong style="color:#8fb1ff;">Lower CPU use</strong><br><span style="color:#9299a8;font-size:14px;line-height:1.55;">Accelerated terminal rendering is restored instead of falling back permanently.</span></td>
              <td width="50%" valign="top" style="padding:14px 0 0 12px;border-top:1px solid #2a2e38;"><strong style="color:#8fb1ff;">Safer restarts</strong><br><span style="color:#9299a8;font-size:14px;line-height:1.55;">Vibyra saves terminal state before installing an update and restarting.</span></td>
            </tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:6px 32px 38px;">
          <a href="{{ $downloadUrl }}" style="display:inline-block;background:#4776ed;color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 24px;border-radius:10px;">Update to Vibyra {{ $version }}</a>
          <p style="margin:16px 0 0;color:#9299a8;font-size:13px;line-height:1.55;">You can also use the Update button inside Vibyra. Finish any active terminal work before choosing Restart now.</p>
        </td></tr>
        <tr><td style="padding:22px 32px;background:#121419;border-top:1px solid #2a2e38;color:#7f8796;font-size:12px;line-height:1.6;">
          You’re receiving this essential service update because you have a verified Vibyra account.<br>
          Questions or continued problems? <a href="mailto:support@vibyra.app" style="color:#8fb1ff;">support@vibyra.app</a> · © {{ now()->year }} Vibyra
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
