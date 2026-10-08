import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { accountOpenLegal } from "../../ipc/account";
import { useReportStore } from "../../state/reportStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { SettingRow, SettingsBlock } from "./SettingsShared";

export function SettingsHelpPane() {
  const [version, setVersion] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { void getVersion().then(setVersion).catch(() => {}); }, []);
  const open = (url: string) => void invoke("shared_chat_open_link", { url }).catch(cause => setError(String(cause)));
  return <>
    <SettingsBlock label="Help">
      <div className="settings-group">
        <SettingRow label="Help & guides"><button className="btn" onClick={() => open("https://vibyra.net/#faq")}>Open guides</button></SettingRow>
        <SettingRow label="Report a problem"><button className="btn" onClick={() => {
          useWorkspaceStore.getState().closeSettings(); void useReportStore.getState().begin();
        }}>Report a problem</button></SettingRow>
        <SettingRow label="Contact Vibyra"><button className="btn" onClick={() => open("https://vibyra.net/privacy/requests?topic=support")}>Contact</button></SettingRow>
      </div>
    </SettingsBlock>
    <SettingsBlock label="About Vibyra">
      <div className="settings-group"><SettingRow label="Version"><span>{version || "Checking…"}</span></SettingRow>
        <SettingRow label="Privacy Policy"><button className="btn" onClick={() => void accountOpenLegal("privacy").catch(cause => setError(String(cause)))}>Read</button></SettingRow>
        <SettingRow label="Terms"><button className="btn" onClick={() => void accountOpenLegal("terms").catch(cause => setError(String(cause)))}>Read</button></SettingRow>
      </div>
    </SettingsBlock>
    {error && <p role="alert" className="profile-feedback profile-feedback--error">{error}</p>}
  </>;
}
