import React from "react";
import { Row, Toggle, Group } from "./FlowControls.jsx";
import DeviceIcon from "../DeviceIcon.jsx";
export default function PhoneSettings({ demo }) {
    const { preferences: p, updatePreferences: update, phone, setPhone } = demo;
    return <>
        <Group title="Connection"><Row label="Remote phone control" hint="Use Vibyra on your phone, nearby or from anywhere."><Toggle label="Remote phone control" value={p.remote} onChange={value => { update({ remote: value }); if (!value) setPhone("disconnected"); }} /></Row>
            <Row label="Typing from your phone" hint="Allow input into your desktop terminals."><Toggle label="Typing from your phone" value={p.phoneTyping} onChange={value => update({ phoneTyping: value })} /></Row></Group>
        <Group title="Phones"><div className="vdev-phone-device"><div className={`vdev-phone-silhouette ${phone === "connected" ? "is-connected" : ""}`}><DeviceIcon name="phone" size={46} /></div><span><strong>Demo iPhone <em>Example</em></strong><small>{phone === "connected" ? "Connected now · sample connection" : phone === "pending" ? "Waiting for your approval" : "No phone connected"}</small></span>{phone === "connected" && <button type="button" onClick={() => setPhone("disconnected")}>Disconnect</button>}</div>
        {phone === "pending" ? <div className="vdev-phone-approval"><strong>Allow Demo iPhone to connect?</strong><p>In the app, you approve a phone before it can access this Mac.</p><div><button type="button" onClick={() => setPhone("disconnected")}>Decline</button><button type="button" className="vdev-flow-primary" onClick={() => setPhone("connected")}>Allow sample phone</button></div></div> : phone !== "connected" && <button type="button" className="vdev-phone-connect" disabled={!p.remote} onClick={() => setPhone("pending")}>Try a sample connection</button>}</Group>
        <p className="vdev-flow-note">Demo only. This does not pair a real phone or expose your computer.</p>
    </>;
}
