import React, { useCallback, useEffect, useState } from "react";
import PortalShell from "../components/PortalShell.jsx";
import Notice from "../components/Notice.jsx";
import ApiKeysPanel from "../components/ApiKeysPanel.jsx";
import WebhooksPanel from "../components/WebhooksPanel.jsx";
import { developerApi } from "../developerApi.js";
import { go } from "../navigation.js";
import { useWebsiteSession } from "../session/WebsiteSessionProvider.jsx";

export default function DeveloperPage() {
  const { user, loading, sessionError } = useWebsiteSession();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => developerApi.overview().then(next => { setData(next); setError(""); })
    .catch(caught => setError(caught.status === 404 ? "The developer API is not switched on for your account yet." : caught.message)), []);
  useEffect(() => { if (!loading && !user && !sessionError) go("/login?next=/account/developer"); }, [loading, user, sessionError]);
  useEffect(() => { if (user) void load(); }, [user, load]);
  return <PortalShell title="Developer" intro="Keys and webhooks for your own tools.">
    {loading && <p role="status">Loading…</p>}
    {sessionError && <Notice tone="error">{sessionError}</Notice>}
    {error && <Notice tone="error">{error}</Notice>}
    {user && data && <div className="account-grid">
      {data.flags.apiKeys && <ApiKeysPanel keys={data.keys} scopes={data.scopes} onChange={load} />}
      {data.flags.webhooks && <WebhooksPanel webhooks={data.webhooks} events={data.events} onChange={load} />}
      {data.flags.apiKeys && <section className="account-panel" aria-label="Connect">
        <p className="panel-label">Connect</p>
        <p>REST: <code>{data.apiBase}</code> with <code>Authorization: Bearer &lt;key&gt;</code>.</p>
        {data.mcpUrl && <p>MCP server: <code>{data.mcpUrl}</code> (Streamable HTTP, same key).</p>}
      </section>}
      <a className="portal-link-button" href="/account">Back to your account</a>
    </div>}
  </PortalShell>;
}
