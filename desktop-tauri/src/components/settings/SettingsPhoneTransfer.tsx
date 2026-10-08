import { useState } from "react";
import { phoneRemoteTransfer, phoneRemoteTransferContext, type RemoteTransferContext } from "../../ipc/phone";
import { usePhoneStore } from "../../state/phoneStore";
import { SettingRow } from "./SettingsShared";

export function SettingsPhoneTransfer({ error }: { error?: string | null }) {
  const [context, setContext] = useState<RemoteTransferContext | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  if (!error?.startsWith("host-transfer-required:") && !context && !problem) return null;
  const review = async () => {
    setBusy(true); setProblem("");
    try { setContext(await phoneRemoteTransferContext()); }
    catch (cause) { setProblem(String(cause)); }
    finally { setBusy(false); }
  };
  const move = async () => {
    if (!context || busy) return;
    setBusy(true); setProblem("");
    try {
      const status = await phoneRemoteTransfer(context);
      usePhoneStore.setState({ status }); setContext(null);
    } catch (cause) { setProblem(String(cause)); }
    finally { setBusy(false); }
  };
  return <div>
    {context ? <SettingRow label={`Move this computer to ${context.email}?`}
      hint="The previous account will lose Vibyra Cloud access to this computer. Phones on this account can request access using your existing phone permissions. This changes Cloud ownership; local projects stay on this computer.">
      <button className="btn btn--ghost" type="button" disabled={busy} onClick={() => { setContext(null); setProblem(""); }}>Cancel</button>
      <button className="btn btn--ghost" type="button" disabled={busy} onClick={() => void move()}>{busy ? "Moving…" : "Move computer"}</button>
    </SettingRow> : <SettingRow label="Computer belongs to another account" hint="Review an account transfer to use Vibyra Cloud with your current account.">
      <button className="btn btn--ghost" type="button" disabled={busy} onClick={() => void review()}>Review transfer</button>
    </SettingRow>}
    {problem && <p role="alert" className="phone-connection__error">{problem}</p>}
  </div>;
}
