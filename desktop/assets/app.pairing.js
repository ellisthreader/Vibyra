function pairingConnectionVisual(state = "waiting") {
  return `<div class="pair-flow-visual pair-flow-visual--${state}" aria-hidden="true">
    <span class="pair-flow-device pair-flow-phone">${icon("phone")}</span>
    <span class="pair-flow-line"><i></i><b>${icon("pulse")}</b><i></i></span>
    <span class="pair-flow-device pair-flow-desktop">${icon("desktop")}</span>
  </div>`;
}

function pairingWaitingView(code, qrAvailable) {
  const qr = qrAvailable
    ? `<div class="pair-qr"><img src="/desktop/pair-qr.svg" alt="QR code to open Vibyra pairing on your phone" /></div>`
    : `<div class="pair-qr pair-qr--unavailable">${icon("wifi")}<span>Connect this computer to Wi-Fi to enable scanning.</span></div>`;
  return `<section class="pair-flow pair-flow--waiting">
    ${pairingConnectionVisual("waiting")}
    <div class="pair-flow-heading"><h3>Scan to connect</h3><p>Open your phone camera and scan this QR code.</p></div>
    <div class="pair-flow-main">
      ${qr}
      <ol class="pair-flow-steps">
        <li><span>1</span><div><strong>Scan the QR</strong><small>Vibyra opens on your phone.</small></div></li>
        <li><span>2</span><div><strong>Review the request</strong><small>Your phone appears here for approval.</small></div></li>
        <li><span>3</span><div><strong>Allow this phone</strong><small>Access starts only after you approve.</small></div></li>
      </ol>
    </div>
    <div class="pair-manual">
      <span>Or enter this code in Vibyra</span>
      <button type="button" class="pair-v2-code" id="copy-pair-code" data-copy-pair-code aria-label="Copy pair code">
        <span class="pair-v2-code-text">${escapeHtml(code)}</span>
        <span class="pair-copy-icon" aria-hidden="true">${icon("copy")}</span>
        <span class="pair-v2-copied" aria-hidden="true">Copied</span>
      </button>
    </div>
    <p class="pair-flow-note">${icon("shield")} Pairing stays on this Wi-Fi and always requires desktop approval.</p>
  </section>`;
}

function pairingApprovalView(deviceName) {
  return `<section class="pair-flow pair-flow--approval">
    ${pairingConnectionVisual("approval")}
    <span class="pair-flow-kicker">Pairing request</span>
    <div class="pair-approval-device"><span>${icon("phone")}</span></div>
    <div class="pair-flow-heading"><h3>${escapeHtml(deviceName)}</h3><p>wants to connect to this computer.</p></div>
    <div class="pair-security-note">${icon("shield")}<span>Allow only if this is your phone and you started pairing just now.</span></div>
    <div class="pair-approval-actions">
      <button class="secondary-button pair-deny-button" id="deny-pair" type="button" ${posting ? "disabled" : ""}>Deny</button>
      <button class="primary-button" id="approve-pair" type="button" ${posting ? "disabled" : ""}>${posting ? "Connecting..." : "Pair phone"}</button>
    </div>
  </section>`;
}

function pairingPhonePermissionView(deviceName) {
  return `<section class="pair-flow pair-flow--phone-permission" role="status" aria-live="polite">
    ${pairingConnectionVisual("phone-permission")}
    <span class="pair-flow-kicker">Desktop approved</span>
    <div class="pair-permission-device" aria-hidden="true">
      <span class="pair-permission-ring"></span>
      <span class="pair-permission-phone">${icon("phone")}</span>
      <span class="pair-permission-check">${icon("check")}</span>
    </div>
    <div class="pair-flow-heading">
      <h3>Waiting for your phone</h3>
      <p>Confirm the permission request in Vibyra to finish connecting ${escapeHtml(deviceName)}.</p>
    </div>
    <div class="pair-permission-status">
      <span class="pair-permission-status-icon">${icon("shield")}</span>
      <span><strong>Approval sent</strong><small>Keep Vibyra open on your phone.</small></span>
      <span class="pair-permission-dots" aria-hidden="true"><i></i><i></i><i></i></span>
    </div>
    <button class="pair-permission-cancel" id="cancel-approved-pair" type="button" ${posting ? "disabled" : ""}>Cancel request</button>
  </section>`;
}

function pairingConnectedView(deviceName) {
  return `<section class="pair-flow pair-flow--connected" role="status" aria-live="polite">
    ${pairingConnectionVisual("connected")}
    <div class="pair-success-burst" aria-hidden="true">
      <span class="pair-success-ring"></span>
      <span class="pair-success-particles">
        <i style="--success-x: 0px; --success-y: -54px;"></i>
        <i style="--success-x: 39px; --success-y: -39px;"></i>
        <i style="--success-x: 54px; --success-y: 0px;"></i>
        <i style="--success-x: 39px; --success-y: 39px;"></i>
        <i style="--success-x: 0px; --success-y: 54px;"></i>
        <i style="--success-x: -39px; --success-y: 39px;"></i>
        <i style="--success-x: -54px; --success-y: 0px;"></i>
        <i style="--success-x: -39px; --success-y: -39px;"></i>
      </span>
      <span class="pair-v2-check">${icon("check")}</span>
    </div>
    <div class="pair-flow-heading"><h3>Phone connected</h3><p>${escapeHtml(deviceName)} can now securely access this desktop.</p></div>
    <div class="pair-connected-capabilities">
      <span>${icon("folder")}Browse projects</span>
      <span>${icon("terminal")}Start AI work</span>
    </div>
    <button type="button" class="pair-v2-unpair" id="unpair-device">Disconnect phone</button>
  </section>`;
}
