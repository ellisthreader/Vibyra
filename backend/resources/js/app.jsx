import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "../css/app.css";

const navItems = [
  { key: "pairing", label: "Pair" },
  { key: "projects", label: "Projects" },
  { key: "activity", label: "Activity" }
];

const emptyState = {
  machineName: "Code X Desktop",
  pairCode: "------",
  pairedDevice: null,
  pendingPair: null,
  latestPreview: null,
  events: [],
  connectionUrls: [],
  projects: []
};

function App() {
  const [activeView, setActiveView] = useState("pairing");
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
    const id = setInterval(refresh, 1200);
    return () => clearInterval(id);
  }, []);

  const paired = Boolean(state.pairedDevice);
  const waitingForPermission = state.pendingPair?.status === "pending";
  const preview = state.latestPreview;
  const statusTone = waitingForPermission ? "warning" : paired ? "success" : "info";

  return (
    <main className="grid min-h-screen grid-cols-[236px_minmax(0,1fr)] bg-[#0A0A0A] text-white max-[860px]:grid-cols-1">
      <aside className="flex flex-col gap-6 border-r border-[#1F1F1F] bg-[#080808] p-5 max-[860px]:border-b max-[860px]:border-r-0">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-white text-[17px] font-black text-[#0A0A0A]">
            X
          </div>
          <div>
            <p className="text-sm font-extrabold">Code X</p>
            <p className="mt-0.5 text-xs font-bold text-[#71717A]">Desktop</p>
          </div>
        </div>

        <nav className="grid gap-2">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveView(item.key)}
              className={`h-11 rounded-lg px-4 text-left text-sm font-extrabold transition ${
                activeView === item.key
                  ? "bg-[#161616] text-white"
                  : "text-[#A1A1AA] hover:bg-[#111111] hover:text-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mt-auto flex items-center gap-3 rounded-lg border border-[#1F1F1F] bg-[#111111] p-3">
          <span className="h-2.5 w-2.5 rounded-full bg-[#22C55E]" />
          <div className="min-w-0">
            <p className="text-sm font-extrabold">Laravel online</p>
            <p className="mt-0.5 truncate text-xs font-bold text-[#71717A]">
              {state.connectionUrls?.[0] ?? "Local network"}
            </p>
          </div>
        </div>
      </aside>

      <section className="grid min-w-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-4 p-6">
        <header className="flex min-h-14 items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase text-[#A1A1AA]">Your coding machine</p>
            <h1 className="mt-1 text-3xl font-black tracking-normal">
              {paired ? "Phone connected" : "Ready to pair"}
            </h1>
          </div>
          <button
            onClick={() => window.close()}
            className="h-10 rounded-lg border border-[#2B2B2B] bg-[#161616] px-4 text-sm font-extrabold text-[#A1A1AA]"
          >
            Quit
          </button>
        </header>

        <section className="grid grid-cols-3 gap-3 max-[860px]:grid-cols-1">
          <Metric label="Machine" value={state.machineName} />
          <Metric label="Phone" value={state.pairedDevice ?? "Not paired"} />
          <Metric label="Projects" value={`${state.projects?.length ?? 0} found`} />
        </section>

        {activeView === "pairing" && (
          <section className="grid grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] gap-4 max-[980px]:grid-cols-1">
            <article className="flex min-h-[390px] flex-col rounded-lg border border-[#1F1F1F] bg-[#111111] p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase text-[#A1A1AA]">Secure pairing</p>
                  <h2 className="mt-1 text-xl font-black">Enter this code on your phone</h2>
                </div>
                <StatusPill tone={statusTone}>
                  {waitingForPermission ? "Permission needed" : paired ? "Paired" : "Waiting"}
                </StatusPill>
              </div>

              <div className="my-6 grid min-h-40 flex-1 place-items-center rounded-lg border border-[#2B2B2B] bg-[#050505] pl-3 font-mono text-7xl font-black tracking-[0.16em]">
                {state.pairCode}
              </div>

              <div className="grid grid-cols-3 gap-2 max-[720px]:grid-cols-1">
                <PairStep index="1" title="Open Code X on your phone" complete />
                <PairStep index="2" title="Approve the phone here" active={waitingForPermission} complete={paired} />
                <PairStep index="3" title="Confirm on the phone" complete={paired} />
              </div>
            </article>

            <PermissionPanel
              pendingPair={state.pendingPair}
              onApprove={() => post("/desktop/approve")}
              onDeny={() => post("/desktop/deny")}
            />
          </section>
        )}

        {activeView === "projects" && (
          <section>
            <SectionTitle eyebrow="Local workspaces" title="Projects available to phone" />
            <div className="grid gap-3">
              {(state.projects ?? []).length === 0 ? (
                <EmptyState>No local projects found yet.</EmptyState>
              ) : (
                state.projects.map((project) => <ProjectRow key={project.id} project={project} />)
              )}
            </div>
          </section>
        )}

        {activeView === "activity" && (
          <section className="grid grid-cols-[minmax(0,1fr)_minmax(340px,0.72fr)] gap-4 max-[980px]:grid-cols-1">
            <article className="overflow-hidden rounded-lg border border-[#1F1F1F] bg-[#111111]">
              <div className="flex items-center justify-between border-b border-[#1F1F1F] p-4">
                <p className="text-xs font-black uppercase text-[#A1A1AA]">Live preview</p>
                <span className="text-sm font-extrabold capitalize text-[#3B82F6]">
                  {preview?.state ?? "Waiting"}
                </span>
              </div>
              <div className="min-h-[330px] bg-[#050505]">
                <div className="flex min-h-10 items-center gap-2 border-b border-[#1F1F1F] px-3">
                  <span className="h-2 w-2 rounded-full bg-[#2B2B2B]" />
                  <span className="h-2 w-2 rounded-full bg-[#2B2B2B]" />
                  <span className="h-2 w-2 rounded-full bg-[#2B2B2B]" />
                  <p className="ml-1 truncate font-mono text-xs font-bold text-[#71717A]">
                    {preview?.url ?? "Preview will appear after pairing"}
                  </p>
                </div>
                <div className="grid gap-3 p-6">
                  <h2 className="text-xl font-black">{preview?.title ?? "No active project"}</h2>
                  <p className="max-w-xl text-sm font-semibold leading-6 text-[#A1A1AA]">
                    {preview?.message ?? "Select a project on your phone to start a live preview stream."}
                  </p>
                </div>
              </div>
            </article>

            <article className="overflow-hidden rounded-lg border border-[#1F1F1F] bg-[#111111]">
              <div className="border-b border-[#1F1F1F] p-4">
                <p className="text-xs font-black uppercase text-[#A1A1AA]">Live updates</p>
                <h2 className="mt-1 text-xl font-black">Desktop event stream</h2>
              </div>
              <div className="max-h-[330px] overflow-auto">
                {(state.events ?? []).length === 0 ? (
                  <EmptyState>Waiting for activity.</EmptyState>
                ) : (
                  state.events.map((event) => <EventRow key={event.id} event={event} />)
                )}
              </div>
            </article>
          </section>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value }) {
  return (
    <article className="min-h-24 rounded-lg border border-[#1F1F1F] bg-[#111111] p-4">
      <p className="text-xs font-black uppercase text-[#A1A1AA]">{label}</p>
      <p className="mt-4 truncate text-2xl font-black">{value}</p>
    </article>
  );
}

function StatusPill({ tone, children }) {
  const classes = {
    success: "bg-[rgba(34,197,94,0.14)] text-[#22C55E]",
    warning: "bg-[rgba(245,158,11,0.14)] text-[#F59E0B]",
    info: "bg-[rgba(59,130,246,0.14)] text-[#3B82F6]"
  };

  return (
    <span className={`rounded-lg px-3 py-2 text-sm font-extrabold ${classes[tone] ?? classes.info}`}>
      {children}
    </span>
  );
}

function PairStep({ index, title, active = false, complete = false }) {
  return (
    <div
      className={`flex min-h-14 items-center gap-2 rounded-lg border bg-[#161616] p-2 ${
        active || complete ? "border-[#3B82F6]" : "border-[#1F1F1F]"
      }`}
    >
      <span
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-xs font-black ${
          active || complete
            ? "border-[#3B82F6] bg-[#3B82F6] text-white"
            : "border-[#2B2B2B] bg-[#070707] text-[#A1A1AA]"
        }`}
      >
        {index}
      </span>
      <p className={`text-sm font-bold leading-tight ${active || complete ? "text-white" : "text-[#A1A1AA]"}`}>
        {title}
      </p>
    </div>
  );
}

function PermissionPanel({ pendingPair, onApprove, onDeny }) {
  if (!pendingPair || pendingPair.status !== "pending") {
    return (
      <article className="flex min-h-[390px] flex-col justify-center rounded-lg border border-[#1F1F1F] bg-[#111111] p-5">
        <p className="text-xs font-black uppercase text-[#A1A1AA]">Permission</p>
        <h2 className="mt-1 text-xl font-black">No pending request</h2>
        <p className="mt-3 text-sm font-semibold leading-6 text-[#A1A1AA]">
          When your phone enters the pairing code, this panel will ask you to approve or deny access.
        </p>
      </article>
    );
  }

  return (
    <article className="flex min-h-[390px] flex-col justify-center rounded-lg border border-[#1F1F1F] bg-[#111111] p-5">
      <p className="text-xs font-black uppercase text-[#A1A1AA]">Permission required</p>
      <h2 className="mt-1 text-xl font-black">{pendingPair.deviceName} wants to pair</h2>
      <p className="mt-3 text-sm font-semibold leading-6 text-[#A1A1AA]">
        Approve this phone to view projects, send prompts, run approved commands, and receive live preview updates.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button onClick={onDeny} className="h-11 rounded-lg border border-[#2B2B2B] bg-[#161616] font-extrabold text-[#A1A1AA]">
          Deny
        </button>
        <button onClick={onApprove} className="h-11 rounded-lg bg-[#3B82F6] font-extrabold text-white">
          Allow Phone
        </button>
      </div>
    </article>
  );
}

function SectionTitle({ eyebrow, title }) {
  return (
    <div className="mb-3">
      <p className="text-xs font-black uppercase text-[#A1A1AA]">{eyebrow}</p>
      <h2 className="mt-1 text-xl font-black">{title}</h2>
    </div>
  );
}

function ProjectRow({ project }) {
  return (
    <article className="grid min-h-[76px] grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-[#1F1F1F] bg-[#111111] p-3">
      <div className="grid h-[42px] w-[42px] place-items-center rounded-lg bg-[#161616] text-sm font-black">
        {project.name.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-extrabold">{project.name}</p>
        <p className="mt-1 text-sm font-semibold text-[#A1A1AA]">{project.stack}</p>
        <p className="mt-1 truncate font-mono text-xs font-semibold text-[#71717A]">{project.path}</p>
      </div>
      <p className="text-xs font-bold text-[#71717A]">{project.updated}</p>
    </article>
  );
}

function EventRow({ event }) {
  return (
    <div className="grid gap-1 border-b border-[#1F1F1F] p-4">
      <p className="truncate text-sm font-extrabold">{event.message}</p>
      <p className="text-xs font-semibold text-[#A1A1AA]">
        {event.source} · {event.tone}
      </p>
    </div>
  );
}

function EmptyState({ children }) {
  return <div className="rounded-lg border border-[#1F1F1F] bg-[#111111] p-4 text-sm font-bold text-[#A1A1AA]">{children}</div>;
}

createRoot(document.getElementById("root")).render(<App />);
