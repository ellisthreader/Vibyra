import { createRoot } from "react-dom/client";
import { PhoneApprovalModal } from "../src/components/phone/PhoneApprovalModal";
import { usePhoneStore } from "../src/state/phoneStore";
import { useAccountStore } from "../src/state/accountStore";
import type { PhoneStatus } from "../src/ipc/phone";
import "../src/styles/tokens.css";
import "../src/styles/base.css";
import "../src/styles/controls.css";
import "../src/styles/modals.css";

const query = new URLSearchParams(location.search);
const calls: [string, unknown][] = [];
const device = (id: string) => ({ id, name: `Phone ${id}` });
let status: PhoneStatus = { enabled: true, typing: true, discoverable: true,
  address: "", error: null, devices: [], active: [], pending: [device("first")] };
let finishApproval: (() => void) | undefined;
let repeat = query.has("repeat");
const publish = (patch: Partial<PhoneStatus>) => {
  status = { ...status, ...patch }; usePhoneStore.setState({ status });
};
(window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
  invoke: async (command: string, args: { id?: string; approve?: boolean }) => {
    calls.push([command, args]);
    if (command === "phone_status") return status;
    if (command === "phone_answer") {
      if (query.has("delay")) await new Promise<void>((resolve) => { finishApproval = resolve; });
      const approved = status.pending.find((p) => p.id === args.id) ?? device(args.id!);
      status = { ...status, pending: status.pending.filter((p) => p.id !== args.id),
        devices: args.approve ? [...status.devices, approved] : status.devices,
        active: args.approve ? [...status.active, args.id!] : status.active };
      if (args.approve && repeat) { repeat = false; status.pending.push(device(args.id!)); }
      return;
    }
    throw new Error(`Unexpected fixture command: ${command}`);
  }, transformCallback: () => 0,
};
useAccountStore.setState((s) => ({ snapshot: { ...s.snapshot, profile: { welcomeKey: "fixture" } as never } }));
usePhoneStore.setState({ status, accountScope: "fixture" });
(window as unknown as { fixture: unknown }).fixture = {
  calls, request: (id: string) => publish({ pending: [...status.pending, device(id)] }),
  busy: () => usePhoneStore.setState({ busy: true }), finishApproval: () => finishApproval?.(),
  reconnect: () => { publish({ active: [] }); publish({ active: ["first"] }); },
  approvalOpen: () => usePhoneStore.getState().approvalOpen,
  switchAccount: () => {
    useAccountStore.setState((s) => ({ snapshot: { ...s.snapshot, profile: { welcomeKey: "other" } as never } }));
    publish({ pending: [], active: [], devices: [] });
  },
};
createRoot(document.getElementById("root")!).render(<div className="app">
  <div className="chrome"><button>Workspace</button></div><div className="shell">Workspace</div>
  <PhoneApprovalModal />
</div>);
