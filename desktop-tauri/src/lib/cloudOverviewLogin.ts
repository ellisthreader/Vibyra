import type { CloudLoginView, CloudProviderState } from "./cloudOverviewTypes";

/** A native upload receipt is not proof that the running Cloud computer is signed in. */
export function cloudLoginWords(view: CloudLoginView | undefined, provider: CloudProviderState, computer = "Mac"): string {
  if (view?.state === "allowing") return `Click Allow on the ${view.id === "claude" ? "Claude" : "Codex"} page that opened in your browser.`;
  if (view?.state === "sending") return "Sending it to Vibyra Cloud, encrypted…";
  if (view?.state === "error") return view.error || "That didn’t finish. Try again.";
  if (provider.signedIn === true) return "Signed in on Vibyra Cloud.";
  if (view?.state === "done" || provider.pending || provider.appliedAt) {
    if (provider.appliedAt && provider.signedIn === false) return "Cloud needs a new sign-in.";
    return provider.appliedAt ? "Sign-in received by Cloud. Checking…" : "Sign-in sent. Waiting for Vibyra Cloud…";
  }
  switch (view?.state) {
    case "waitingForCloud": return "Waits for Vibyra Cloud to start once.";
    case "notInstalled": return `Install ${view.id === "claude" ? "Claude" : "Codex"} on this ${computer} to use it in Vibyra Cloud.`;
    case "ready": return "Not signed in on Vibyra Cloud yet.";
    case "disabled": return "Not available in Vibyra Cloud.";
    default: return "Checking sign-in…";
  }
}
export function cloudLoginCanAllow(view: CloudLoginView | undefined, provider: CloudProviderState): boolean {
  if (provider.pending && view?.state !== "error") return false;
  return provider.signedIn !== true && (view?.state === "ready" || view?.state === "error" || view?.state === "waitingForCloud"
    || view?.state === "done" && !!provider.appliedAt && provider.signedIn === false);
}
