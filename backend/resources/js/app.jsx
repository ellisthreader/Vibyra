import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "../css/app.css";

const emptyState = {
  machineName: "Vibyra Desktop",
  pairCode: "------",
  pairedDevice: null,
  pendingPair: null,
  events: [],
  projects: []
};

function App() {
  const [state, setState] = useState(emptyState);

  async function refresh() {
    const response = await fetch("/desktop/state");
    setState(await response.json());
  }

  async function post(path) {
    await fetch(path, { method: "POST" });
    await refresh();
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 900);
    return () => clearInterval(id);
  }, []);

  const paired = Boolean(state.pairedDevice);
  const pending = state.pendingPair?.status === "pending";
  const latestEvents = useMemo(() => (state.events ?? []).slice(0, 18), [state.events]);

  return (
    <main className="min-h-screen bg-[#050508] p-5 text-white">
      <section className="mx-auto grid max-w-6xl gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#252033] pb-4">
          <div className="flex items-center gap-4">
            <img src="/vibyra.png" alt="Vibyra" className="h-16 w-16 object-contain" />
            <div>
            <p className="text-xs font-black uppercase text-[#FF35C8]">Vibyra Desktop</p>
            <h1 className="mt-1 text-3xl font-black">{state.machineName}</h1>
            </div>
          </div>
          <Status tone={pending ? "warning" : paired ? "success" : "info"}>
            {pending ? "Approval needed" : paired ? "Phone connected" : "Waiting"}
          </Status>
        </header>

        <section className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-4 max-[900px]:grid-cols-1">
          <article className="rounded-lg border border-[#252033] bg-[#101014] p-5">
            <p className="text-xs font-black uppercase text-[#FF35C8]">Pairing code</p>
            <div className="my-5 grid min-h-36 place-items-center rounded-lg border border-[#3A2A55] bg-[#09070E] pl-3 font-mono text-6xl font-black tracking-[0.16em] text-[#FFB84D]">
              {state.pairCode}
            </div>
            <p className="text-sm font-bold leading-6 text-[#A1A1AA]">
              Open the phone app, enter this code, then approve the request here.
            </p>

            {pending ? (
              <div className="mt-5 rounded-lg border border-[#3A2A55] bg-[#17131F] p-4">
                <h2 className="text-lg font-black">{state.pendingPair.deviceName} wants access</h2>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button onClick={() => post("/desktop/deny")} className="h-11 rounded-lg border border-[#3A2A55] font-extrabold text-[#A1A1AA]">
                    Deny
                  </button>
                  <button onClick={() => post("/desktop/approve")} className="h-11 rounded-lg bg-gradient-to-r from-[#7B2CFF] via-[#FF35C8] to-[#FFB84D] font-extrabold">
                    Allow
                  </button>
                </div>
              </div>
            ) : null}
          </article>

          <article className="rounded-lg border border-[#252033] bg-[#101014] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase text-[#FF35C8]">Activity</p>
                <h2 className="mt-1 text-xl font-black">Live Vibyra stream</h2>
              </div>
              <p className="text-sm font-bold text-[#71717A]">{latestEvents.length} events</p>
            </div>

            <div className="mt-4 max-h-[520px] overflow-auto rounded-lg border border-[#252033] bg-[#09070E]">
              {latestEvents.length === 0 ? (
                <Empty>Nothing yet.</Empty>
              ) : (
                latestEvents.map((event) => <Event key={event.id} event={event} />)
              )}
            </div>
          </article>
        </section>

        <section className="rounded-lg border border-[#252033] bg-[#101014] p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase text-[#FF35C8]">Projects</p>
              <h2 className="mt-1 text-xl font-black">Files available to phone</h2>
            </div>
            <p className="text-sm font-bold text-[#71717A]">{state.projects?.length ?? 0} found</p>
          </div>

          <div className="grid gap-2">
            {(state.projects ?? []).slice(0, 8).map((project) => (
              <div key={project.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-[#252033] bg-[#17131F] p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold">{project.name}</p>
                  <p className="mt-1 truncate font-mono text-xs font-semibold text-[#71717A]">{project.path}</p>
                </div>
                <p className="text-xs font-bold text-[#A1A1AA]">{project.stack}</p>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function Status({ tone, children }) {
  const classes = {
    success: "bg-[rgba(34,197,94,0.14)] text-[#22C55E]",
    warning: "bg-[rgba(245,158,11,0.14)] text-[#F59E0B]",
    info: "bg-[rgba(59,130,246,0.14)] text-[#3B82F6]"
  };

  return <span className={`rounded-lg px-3 py-2 text-sm font-extrabold ${classes[tone]}`}>{children}</span>;
}

function Event({ event }) {
  const color = event.tone === "success" ? "#22C55E" : event.tone === "warning" ? "#F59E0B" : event.tone === "error" ? "#EF4444" : "#3B82F6";

  return (
    <div className="grid grid-cols-[10px_minmax(0,1fr)] gap-3 border-b border-[#1F1F1F] p-3">
      <span className="mt-1.5 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <div className="min-w-0">
        <p className="break-words text-sm font-bold">{event.message}</p>
        <p className="mt-1 text-xs font-semibold text-[#71717A]">{event.source}</p>
      </div>
    </div>
  );
}

function Empty({ children }) {
  return <div className="p-4 text-sm font-bold text-[#71717A]">{children}</div>;
}

createRoot(document.getElementById("root")).render(<App />);
