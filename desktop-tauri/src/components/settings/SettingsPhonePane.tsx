import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { hostSetupCommand, type HostPlatform } from "../../lib/phoneSetup";
import { SettingRow, SettingsBlock } from "./SettingsShared";

export function SettingsPhonePane() {
  const [platform, setPlatform] = useState<HostPlatform>(/Win/.test(navigator.platform) ? "windows" : "linux");
  const [project, setProject] = useState("");
  const [address, setAddress] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  let command = "";
  let validation = "";
  try { command = hostSetupCommand(platform, project, address); }
  catch (reason) { validation = String((reason as Error).message); }
  const run = async (action: () => Promise<unknown>, success = "") => {
    try { await action(); setError(""); setNotice(success); }
    catch (reason) { setError(String(reason)); setNotice(""); }
  };
  const open = (resource: string) => void run(() => invoke("phone_open_resource", { resource }));
  return <>
    <SettingsBlock label="Work in progress">
      <p className="setting-row__hint">Try the phone companion with Vibyra Host. This early preview opens its own terminal sessions; existing Desktop chats do not sync to your phone yet.</p>
      <div className="settings-group">
        <SettingRow label="Explore the phone app" hint="Opens the welcome screen in your browser. Sample work never runs commands on your computer.">
          <button className="btn" onClick={() => open("app")}>Open phone app</button>
        </SettingRow>
        <SettingRow label="1. Download Vibyra Host" hint="Choose the Windows or Linux download. Host is a separate app during this preview.">
          <button className="btn" onClick={() => open("downloads")}>Download Host</button>
        </SettingRow>
      </div>
    </SettingsBlock>
    <SettingsBlock label="2. Set up a local Wi-Fi connection">
      <p className="setting-row__hint">Use the native phone preview on the same trusted Wi-Fi. The hosted HTTPS browser app needs a separately configured secure connection (wss). Phone store delivery and automatic setup are still in progress.</p>
      <div className="settings-group">
        <SettingRow label="Computer" stack><select className="input" aria-label="Host operating system" value={platform}
          onChange={event => { setPlatform(event.target.value as HostPlatform); setNotice(""); }}>
          <option value="linux">Linux</option><option value="windows">Windows (PowerShell)</option>
        </select></SettingRow>
        <SettingRow label="Project folder" hint="The folder you want to work on." stack>
          <input className="input" aria-label="Host project folder" value={project} placeholder={platform === "windows" ? "C:\\Projects\\app" : "/home/you/Projects/app"}
            onChange={event => { setProject(event.target.value); setNotice(""); }} />
        </SettingRow>
        <SettingRow label="Computer Wi-Fi address" hint="Find IPv4 in your computer’s network settings." stack>
          <input className="input" aria-label="Computer Wi-Fi address" value={address} placeholder="192.168.1.20"
            onChange={event => { setAddress(event.target.value); setNotice(""); }} />
        </SettingRow>
      </div>
      <p className="setting-row__hint">Open {platform === "windows" ? "PowerShell" : "a terminal"} in the folder containing the downloaded Host, then review and run this command:</p>
      {command ? <pre tabIndex={0} aria-label="Host setup command" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", userSelect: "text" }}>{command}</pre>
        : <p className="setting-row__hint">{validation}</p>}
      <button className="btn" disabled={!command} onClick={() => void run(() => invoke("write_clipboard_text", { text: command }), "Setup command copied.")}>Copy setup command</button>
    </SettingsBlock>
    <SettingsBlock label="3. Connect and approve">
      <p className="setting-row__hint">In the phone app, choose Connect computer and paste the pairing link from Host. Approve the displayed device key in the Host console. Keep that console open and your computer awake.</p>
      <p className="setting-row__hint">Pair only a device you trust: it can run commands with your computer account’s permissions. Use Host’s help command to manage trusted devices. Disconnecting the phone leaves work running; closing Host stops its sessions.</p>
      <button className="btn" onClick={() => open("guide")}>Full connection guide</button>
    </SettingsBlock>
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
  </>;
}
