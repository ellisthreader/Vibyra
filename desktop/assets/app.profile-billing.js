function profileBillingNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function profileBillingPercent(used, cap) {
  const limit = profileBillingNumber(cap);
  if (!limit) return null;
  return Math.min(100, Math.max(0, Math.round((profileBillingNumber(used) / limit) * 100)));
}

function profileBillingCreditRefresh(meta) {
  if (meta?.tier?.key === "free") return "";
  const raw = meta?.creditsResetAt || meta?.account?.creditsResetAt || meta?.account?.planRenewsAt;
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

function profileBillingDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

function profileBillingPrice(meta) {
  if (meta?.tier?.key === "free") return "Free";
  const annual = meta?.cycle === "annual";
  const pence = profileBillingNumber(meta?.planPricePence);
  if (!pence) return annual ? "Annual plan" : "Monthly plan";
  const currency = String(meta?.billingCurrency || "gbp").toUpperCase();
  const price = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: pence % 100 ? 2 : 0
  }).format(pence / 100);
  return `${price} · ${annual ? "Annual" : "Monthly"}`;
}

function profileBillingLimit(label, used, cap) {
  const percent = profileBillingPercent(used, cap);
  const value = percent === null ? "Not available" : `${percent}% used`;
  return `<div class="profile-billing-limit"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function profileBillingProvider(meta) {
  return String(meta?.billingProvider || meta?.account?.billingProvider || "").trim().toLowerCase();
}

function profileBillingProviderLink(label, detail, url) {
  return `<section class="profile-billing-management">
    <div><h2>Billing details</h2><p>${escapeHtml(detail)}</p></div>
    <button class="profile-billing-provider" type="button" data-profile-action="open-url" data-profile-value="${escapeHtml(url)}">${escapeHtml(label)}</button>
  </section>`;
}

function profileBillingManagement(meta, paid) {
  if (!paid) {
    return `<section class="profile-billing-management">
      <div><h2>Membership</h2><p>Upgrade to increase monthly credits and unlock paid plan access.</p></div>
      <button class="primary-button compact-button" type="button" data-profile-action="open-plans" data-profile-key="plan">Upgrade plan</button>
    </section>`;
  }
  const provider = profileBillingProvider(meta);
  if (provider === "iap-apple") {
    return profileBillingProviderLink(
      "Manage Apple subscription",
      "Payment and invoices are managed by Apple.",
      "https://apps.apple.com/account/subscriptions"
    );
  }
  if (provider === "iap-google") {
    return profileBillingProviderLink(
      "Manage Google Play subscription",
      "Payment and invoices are managed by Google Play.",
      "https://play.google.com/store/account/subscriptions"
    );
  }
  const stripeCapability = meta?.canManageStripeBilling ?? meta?.account?.canManageStripeBilling;
  const stripeManaged = provider === "stripe" && stripeCapability === true;
  if (!stripeManaged) {
    if (provider === "manual") {
      const renewal = profileBillingCreditRefresh(meta) || "Not scheduled";
      return `<section class="profile-billing-management profile-billing-management--secure">
        <div class="profile-billing-security-copy"><h2>Billing details</h2></div>
        <dl class="profile-billing-security-details">
          <div><dt>Payment method</dt><dd>Test card ···· 4242</dd></div>
          <div><dt>Next billing date</dt><dd>${escapeHtml(renewal)}</dd></div>
          <div><dt>Latest invoice</dt><dd>DEMO-0001 <span>Paid</span></dd></div>
        </dl>
      </section>`;
    }
    return `<section class="profile-billing-management">
      <div><h2>Billing details</h2><p>Contact Vibyra to manage this membership.</p></div>
      <button class="profile-billing-provider" type="button" data-profile-action="open-url" data-profile-value="mailto:support@vibyra.app?subject=Vibyra%20billing%20support">Contact billing support</button>
    </section>`;
  }
  const busy = typeof profileBillingBusy !== "undefined" && profileBillingBusy;
  return `<section class="profile-billing-management">
    <div><h2>Billing details</h2><p>Payment methods and invoices.</p></div>
    <button class="secondary-button compact-button" type="button" data-profile-action="manage-billing" data-profile-key="billing" ${busy ? "disabled" : ""}>${busy ? "Opening..." : "View billing"}</button>
  </section>`;
}

function profileMembershipActions(meta) {
  const endAction = meta?.membershipCancelAtPeriodEnd
    ? `<span class="profile-billing-membership-pending">Cancellation scheduled</span>`
    : `<button class="is-danger" type="button" data-profile-action="show-billing-cancel">End membership</button>`;
  return `<section class="profile-billing-membership-actions">
    <button type="button" data-profile-action="change-membership">Change membership</button>
    ${endAction}
  </section>`;
}

function profileMembershipManagement(meta, paid) {
  if (!paid) return profileBillingManagement(meta, false);
  if (!profileBillingManageOpen) {
    return `<section class="profile-billing-manage-entry">
      <div><h2>Manage membership</h2><p>Change or end your plan.</p></div>
      <button class="secondary-button compact-button" type="button" data-profile-action="show-membership-management">Manage membership</button>
    </section>`;
  }
  return `<section class="profile-billing-manage-panel">
    <header><div><span>Membership</span><h2>Manage membership</h2></div><button type="button" data-profile-action="hide-membership-management" aria-label="Close membership management">Close</button></header>
    ${profileBillingManagement(meta, true)}
    ${profileBillingCancellation(meta)}
    ${profileMembershipActions(meta)}
  </section>`;
}

function profileBillingSection(meta) {
  if (typeof profileBillingPlanOpen !== "undefined" && profileBillingPlanOpen && typeof renderProfilePlanPicker === "function") {
    return renderProfilePlanPicker(meta);
  }
  const paid = meta?.tier?.key !== "free";
  const allowance = profileBillingNumber(meta?.allowance);
  const used = profileBillingNumber(meta?.used);
  const usage = allowance ? Math.min(100, Math.round((used / allowance) * 100)) : 0;
  const creditRefresh = profileBillingCreditRefresh(meta);
  const refreshLine = paid && creditRefresh
    ? `<p class="profile-billing-refresh">Next credit refresh ${escapeHtml(creditRefresh)}</p>`
    : "";
  const membershipEnd = profileBillingDate(meta?.membershipEndsAt);
  const cancellationLine = paid && meta?.membershipCancelAtPeriodEnd && membershipEnd
    ? `<p class="profile-billing-cancellation-date">Membership ends ${escapeHtml(membershipEnd)}</p>`
    : "";
  const message = typeof profileBillingMessage !== "undefined" ? profileBillingMessage : "";
  const danger = typeof profileBillingMessageDanger !== "undefined" && profileBillingMessageDanger;
  const status = message
    ? `<p class="profile-billing-status${danger ? " is-danger" : ""}" role="${danger ? "alert" : "status"}">${escapeHtml(message)}</p>`
    : "";
  return `${profileHeader("", "Billing")}
    <div class="profile-billing">
      ${status}
      <section class="profile-billing-plan">
        <div><span>Current plan</span><h2>${escapeHtml(meta?.planLabel || "Free")}</h2><p>${escapeHtml(profileBillingPrice(meta))}</p>${refreshLine}${cancellationLine}</div>
      </section>
      <section class="profile-billing-usage">
        <div class="profile-billing-usage-head"><span>Monthly credits</span><strong>${formatCredits(used)} / ${formatCredits(allowance)}</strong></div>
        <div class="${allowance ? "credits-bar" : "credits-bar credits-bar--empty"}" role="progressbar" aria-label="Monthly credits used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${usage}"><span style="width:${usage}%"></span></div>
        <div class="profile-billing-limits">${profileBillingLimit("5-hour limit", meta?.burstUsed, meta?.burstCap)}${profileBillingLimit("Weekly limit", meta?.weeklyUsed, meta?.weeklyCap)}</div>
      </section>
      ${profileMembershipManagement(meta, paid)}
    </div>`;
}
