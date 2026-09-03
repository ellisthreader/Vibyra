import { useEffect, useMemo, useState } from "react";

import type { PermissionMode, Schedule } from "../../agentTypes";
import { routineZones } from "../../ipc/agentConfig";
import { describeSchedule } from "../../lib/routineSchedule";
import { useAgentRosterStore } from "../../state/agentRosterStore";
import { useAgentWorkStore } from "../../state/agentWorkStore";
import { EditorDialog } from "./EditorDialog";
import { RoutineScheduleFields } from "./RoutineScheduleFields";

/**
 * Creating or editing a routine.
 *
 * The resolved sentence under the fields is the whole point of this form. A
 * schedule is easy to set and hard to read back, so what it will actually do
 * is spelled out in words before it can be saved — and the same arithmetic
 * that writes that sentence is what the scheduler runs, because both come from
 * the native side.
 */
export function RoutineEditor({
  routineId,
  onClose,
}: {
  routineId?: string;
  onClose: () => void;
}) {
  const routines = useAgentWorkStore((state) => state.routines);
  const save = useAgentWorkStore((state) => state.saveRoutine);
  const error = useAgentWorkStore((state) => state.error);
  const agents = useAgentRosterStore((state) => state.agents);
  const existing = routines.find((entry) => entry.id === routineId);

  const [agentId, setAgentId] = useState(existing?.agentId ?? agents[0]?.id ?? "");
  const [name, setName] = useState(existing?.name ?? "");
  const [instruction, setInstruction] = useState(existing?.instruction ?? "");
  const [kind, setKind] = useState<Schedule["kind"]>(existing?.schedule.kind ?? "daily");
  const [time, setTime] = useState(minuteToClock(existing?.schedule));
  const [days, setDays] = useState<number[]>(
    existing?.schedule.kind === "weekdays" ? existing.schedule.days : [0, 1, 2, 3, 4],
  );
  const [minutes, setMinutes] = useState(
    existing?.schedule.kind === "every" ? existing.schedule.minutes : 60,
  );
  const [timezone, setTimezone] = useState(existing?.timezone ?? "");
  const [permission, setPermission] = useState<PermissionMode>(existing?.permission ?? "plan");
  const [zones, setZones] = useState<string[]>([]);

  useEffect(() => {
    void routineZones().then((found) => {
      setZones(found);
      setTimezone((current: string) => current || found[0] || "UTC");
    });
  }, []);

  const schedule = useMemo<Schedule>(() => {
    const minuteOfDay = clockToMinute(time);
    if (kind === "every") return { kind: "every", minutes };
    if (kind === "weekdays") return { kind: "weekdays", days, minuteOfDay };
    return { kind: "daily", minuteOfDay };
  }, [days, kind, minutes, time]);

  const submit = async () => {
    const ok = await save(
      { agentId, name, instruction, schedule, timezone, permission },
      routineId,
    );
    if (ok) onClose();
  };

  return (
    <EditorDialog
      title={routineId ? `Edit ${existing?.name ?? "routine"}` : "New routine"}
      lede="Each run opens a fresh chat as the teammate that owns it, with that teammate's brief, folders and memory."
      submitLabel={routineId ? "Save routine" : "Create routine"}
      busy={!name.trim() || !instruction.trim() || !agentId}
      error={error}
      onClose={onClose}
      onSubmit={() => void submit()}
    >
      <label className="field">
        <span>Teammate</span>
        <select
          className="input"
          value={agentId}
          onChange={(event) => setAgentId(event.target.value)}
        >
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Name</span>
        <input
          className="input"
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Morning check"
        />
      </label>

      <label className="field">
        <span>What it does each time</span>
        <textarea
          className="input"
          value={instruction}
          rows={3}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="Summarise what changed overnight and flag anything broken."
        />
      </label>

      <RoutineScheduleFields
        kind={kind}
        onKind={setKind}
        time={time}
        onTime={setTime}
        minutes={minutes}
        onMinutes={setMinutes}
        days={days}
        onDays={setDays}
        timezone={timezone}
        onTimezone={setTimezone}
        zones={zones}
      />

      <label className="field">
        <span>Access while it runs</span>
        <select
          className="input"
          value={permission}
          onChange={(event) => setPermission(event.target.value as PermissionMode)}
        >
          <option value="plan">Plan only — reads and reports, changes nothing</option>
          <option value="standard">Standard — may edit inside granted folders</option>
          <option value="full">Full access — granted folders, sandbox relaxed</option>
        </select>
      </label>
      {permission !== "plan" && (
        <p className="routine-editor__warn">
          This runs unattended and may change files. Anything outward-facing still waits for
          your approval.
        </p>
      )}

      <p className="routine-editor__resolved">{describeSchedule(schedule, timezone)}</p>
    </EditorDialog>
  );
}

function minuteToClock(schedule: Schedule | undefined): string {
  const minute = schedule && schedule.kind !== "every" ? schedule.minuteOfDay : 9 * 60;
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function clockToMinute(clock: string): number {
  const [hours, minutes] = clock.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}
