const profileBillingCancelReasons = [
  ["too_expensive", "It costs too much"],
  ["not_using_enough", "I am not using it enough"],
  ["missing_features", "It is missing features I need"],
  ["technical_issues", "I had technical issues"],
  ["switching_service", "I am switching to another service"],
  ["temporary_break", "I only need a temporary break"],
  ["other", "Another reason"]
];

function profileBillingCancellationCopy(meta) {
  const provider = profileBillingProvider(meta);
  if (provider === "manual") {
    const raw = meta?.membershipEndsAt || meta?.account?.membershipEndsAt;
    const date = raw ? new Date(raw) : null;
    const label = date && !Number.isNaN(date.getTime())
      ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(date)
      : "the end of your paid term";
    return `Your membership stays active until ${label}. After that, your account moves to Free.`;
  }
  if (provider === "stripe") {
    return "Your feedback will be saved before Stripe opens to confirm the subscription cancellation.";
  }
  if (provider === "iap-apple") {
    return "Your feedback will be saved before Apple subscription settings open.";
  }
  if (provider === "iap-google") {
    return "Your feedback will be saved before Google Play subscription settings open.";
  }
  return "Your feedback will be saved before Vibyra gives you the safest next step.";
}

function profileBillingCancellation(meta) {
  if (meta?.tier?.key === "free") return "";
  if (!profileBillingCancelOpen) return "";
  const reasons = profileBillingCancelReasons.map(([value, label]) => (
    `<label class="profile-billing-cancel-reason"><input type="radio" name="billing-cancel-reason" value="${escapeAttribute(value)}" /><span>${escapeHtml(label)}</span></label>`
  )).join("");
  return `<section class="profile-billing-cancel-panel" aria-label="Cancel membership">
    <header><span>Cancellation request</span><h2>Before you cancel</h2><p>${escapeHtml(profileBillingCancellationCopy(meta))}</p></header>
    <fieldset><legend>Why are you leaving?</legend><div class="profile-billing-cancel-reasons">${reasons}</div></fieldset>
    <label class="profile-billing-cancel-detail"><span>Anything else? <small>Optional unless you chose another reason</small></span><textarea id="billing-cancel-details" rows="3" maxlength="1000" placeholder="Tell us what could have been better"></textarea></label>
    <label class="profile-billing-cancel-confirm"><input id="billing-cancel-confirmed" type="checkbox" /><span>I understand renewal will stop and my membership will end after the paid term.</span></label>
    <div class="profile-billing-cancel-actions">
      <button class="danger-button compact-button" type="button" data-profile-action="submit-billing-cancel" ${profileBillingCancelBusy ? "disabled" : ""}>${profileBillingCancelBusy ? "Submitting..." : "Confirm cancellation"}</button>
      <button class="secondary-button compact-button" type="button" data-profile-action="hide-billing-cancel" ${profileBillingCancelBusy ? "disabled" : ""}>Keep membership</button>
    </div>
    ${profileBillingCancelMessage ? `<p class="profile-billing-cancel-status${profileBillingCancelDanger ? " is-danger" : ""}" role="${profileBillingCancelDanger ? "alert" : "status"}">${escapeHtml(profileBillingCancelMessage)}</p>` : ""}
  </section>`;
}

function showBillingCancellation() {
  profileBillingManageOpen = true;
  profileBillingCancelOpen = true;
  profileBillingCancelMessage = "";
  profileBillingCancelDanger = false;
  renderProfile();
  requestAnimationFrame(() => document.querySelector(".profile-billing-cancel-panel")?.scrollIntoView({ block: "nearest" }));
}

function showMembershipManagement() {
  profileBillingManageOpen = true;
  profileBillingCancelOpen = false;
  profileBillingCancelMessage = "";
  renderProfile();
}

function hideMembershipManagement() {
  if (profileBillingCancelBusy || profileBillingBusy) return;
  profileBillingManageOpen = false;
  profileBillingCancelOpen = false;
  profileBillingCancelMessage = "";
  renderProfile();
}

function hideBillingCancellation() {
  if (profileBillingCancelBusy) return;
  profileBillingCancelOpen = false;
  profileBillingCancelMessage = "";
  profileBillingCancelDanger = false;
  renderProfile();
}

async function submitBillingCancellation() {
  const token = desktopAuthSession()?.token;
  const reason = document.querySelector('input[name="billing-cancel-reason"]:checked')?.value || "";
  const details = document.getElementById("billing-cancel-details")?.value?.trim() || "";
  const confirmed = Boolean(document.getElementById("billing-cancel-confirmed")?.checked);
  if (!reason) return setBillingCancellationError("Choose why you are cancelling.");
  if (reason === "other" && !details) return setBillingCancellationError("Tell us why you are cancelling.");
  if (!confirmed) return setBillingCancellationError("Confirm that you want to cancel membership.");
  if (!token) return setBillingCancellationError("Log in again to cancel membership.");

  profileBillingCancelBusy = true;
  profileBillingCancelMessage = "Saving your feedback securely...";
  profileBillingCancelDanger = false;
  renderProfile();
  try {
    const response = await fetch(`${appApiBaseUrl()}/api/billing/cancel`, {
      method: "POST",
      headers: await desktopAccountHeaders(token, { "Content-Type": "application/json" }),
      body: JSON.stringify({ reason, details, confirmed: true })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false) throw new Error(result?.error || "Could not cancel membership.");
    if (result.user) {
      if (typeof storeDesktopAuthSession === "function") storeDesktopAuthSession(token, result.user);
      if (typeof currentState !== "undefined") currentState = { ...currentState, desktopAccount: result.user };
      profileBillingManageOpen = false;
      profileBillingCancelOpen = false;
      const effective = result.effectiveAt ? new Date(result.effectiveAt) : null;
      const label = effective && !Number.isNaN(effective.getTime())
        ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(effective)
        : "the end of your paid term";
      profileBillingMessage = `Cancellation scheduled. Your membership stays active until ${label}.`;
      profileBillingMessageDanger = false;
    } else if (result.url) {
      window.open(result.url, "_blank", "noopener");
      profileBillingCancelMessage = "Feedback saved. Complete cancellation with your billing provider.";
    }
  } catch (error) {
    profileBillingCancelMessage = error instanceof Error ? error.message : "Could not cancel membership.";
    profileBillingCancelDanger = true;
  } finally {
    profileBillingCancelBusy = false;
    renderProfile();
  }
}

function setBillingCancellationError(message) {
  profileBillingCancelMessage = message;
  profileBillingCancelDanger = true;
  const status = document.querySelector(".profile-billing-cancel-status");
  if (status) {
    status.classList.add("is-danger");
    status.setAttribute("role", "alert");
    status.textContent = message;
  } else {
    renderProfile();
  }
}
