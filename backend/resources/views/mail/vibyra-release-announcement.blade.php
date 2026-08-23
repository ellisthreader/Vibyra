<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Vibyra {{ $version }} is here</title>
</head>
<body style="margin:0;background:#0e0f12;color:#f7f8fb;font-family:Inter,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;color:transparent;">A cleaner Vibyra update with in-app bug reporting and screenshots.</div>
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
          <span style="display:inline-block;padding:6px 10px;background:#1f2d52;color:#8fb1ff;border-radius:999px;font-size:12px;font-weight:700;">VERSION {{ $version }}</span>
          <h1 style="margin:18px 0 12px;font-size:34px;line-height:1.12;letter-spacing:-1px;">A smoother Vibyra,<br>with a direct line to us.</h1>
          <p style="margin:0;color:#b7bdc9;font-size:16px;line-height:1.7;">Hi {{ $firstName }}, the latest Vibyra Desktop release is ready. You can now report a bug from the title bar, attach screenshots or images, and choose exactly which technical details to include.</p>
        </td></tr>
        <tr><td style="padding:20px 32px 8px;">
          <img src="{{ $reportImageUrl }}" width="616" alt="Vibyra's new report a bug dialog" style="display:block;width:100%;height:auto;border:1px solid #303644;border-radius:14px;">
        </td></tr>
        <tr><td style="padding:24px 32px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td width="50%" valign="top" style="padding:0 12px 12px 0;"><strong style="color:#8fb1ff;">01</strong><br><strong>Report in context</strong><br><span style="color:#9299a8;font-size:14px;line-height:1.55;">Send the issue without leaving your workspace.</span></td>
              <td width="50%" valign="top" style="padding:0 0 12px 12px;"><strong style="color:#8fb1ff;">02</strong><br><strong>Show what happened</strong><br><span style="color:#9299a8;font-size:14px;line-height:1.55;">Attach a screenshot or image in a couple of clicks.</span></td>
            </tr>
            <tr>
              <td width="50%" valign="top" style="padding:12px 12px 0 0;"><strong style="color:#8fb1ff;">03</strong><br><strong>Stay in control</strong><br><span style="color:#9299a8;font-size:14px;line-height:1.55;">Review included app and system details before sending.</span></td>
              <td width="50%" valign="top" style="padding:12px 0 0 12px;"><strong style="color:#8fb1ff;">04</strong><br><strong>Update cleanly</strong><br><span style="color:#9299a8;font-size:14px;line-height:1.55;">Existing supported installs receive the signed update prompt.</span></td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:4px 32px 24px;">
          <img src="{{ $workspaceImageUrl }}" width="616" alt="Vibyra multi-terminal workspace" style="display:block;width:100%;height:auto;border:1px solid #303644;border-radius:14px;">
        </td></tr>
        <tr><td align="center" style="padding:8px 32px 38px;">
          <a href="{{ $downloadUrl }}" style="display:inline-block;background:#4776ed;color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 24px;border-radius:10px;">Download Vibyra {{ $version }}</a>
          <p style="margin:16px 0 0;color:#9299a8;font-size:13px;">Windows and Linux downloads are available from the official Vibyra page.</p>
        </td></tr>
        <tr><td style="padding:22px 32px;background:#121419;border-top:1px solid #2a2e38;color:#7f8796;font-size:12px;line-height:1.6;">
          You’re receiving this service update because you have a Vibyra account.<br>
          Questions? <a href="mailto:support@vibyra.app" style="color:#8fb1ff;">support@vibyra.app</a> · © {{ now()->year }} Vibyra
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
