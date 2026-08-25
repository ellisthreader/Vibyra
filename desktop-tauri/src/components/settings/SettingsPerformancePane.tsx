import { hibernateIdleTerminals } from "../../lib/terminalHibernate";
import { useTerminalStore } from "../../state/terminalStore";
import { GraphicsCard } from "./GraphicsCard";
import { PerformanceModeCard } from "./PerformanceModeCard";
import { PerformanceStatusCard } from "./PerformanceStatusCard";
import { SettingRow, SettingsBlock, Switch, type SettingsPaneProps } from "./SettingsShared";

/**
 * Two user decisions (the performance mode, the graphics mode), everything
 * else visible and automatic. The status card shows the numbers the watchdog
 * acts on; the rest of the pane holds the resource levers that used to hide
 * inside General.
 */
export function SettingsPerformancePane({ settings, update }: SettingsPaneProps) {
  const maxPerformance = settings.performanceMode === "max";
  // Subscribing to the store keeps the idle count honest while the pane is
  // open — hibernating from here should immediately show zero left to do.
  const idleCount = useTerminalStore(
    (state) =>
      state.panes.filter(
        (pane) =>
          pane.status === "running" &&
          pane.visibility !== "hibernated" &&
          state.activity[pane.id] === "idle",
      ).length,
  );

  return (
    <>
      <PerformanceModeCard settings={settings} update={update} />
      <PerformanceStatusCard />
      <GraphicsCard settings={settings} update={update} />
      <SettingsBlock label="Terminal resources">
        <div className="settings-group">
          <SettingRow label="Scrollback" hint="Lines of history kept per terminal — the main memory lever">
            <input className="input input--sm" type="number" min={200} max={100000} step={100} value={settings.scrollbackLines} onChange={(event) => void update({ scrollbackLines: Number(event.target.value) || 5000 })} />
          </SettingRow>
          <SettingRow label="Restore terminal output" hint="Your open terminals and layout always come back. This also saves the last of each terminal's output so you can read where you left off — turn it off if this machine is shared, and restored terminals will reopen blank.">
            <Switch label="Restore terminal output" checked={settings.persistTerminalScrollback} onChange={(next) => void update({ persistTerminalScrollback: next })} />
          </SettingRow>
          <SettingRow label="Hibernate idle terminals" hint="Frees the memory and delivery work of every pane that has gone quiet. They wake with their output intact the moment you click them.">
            <button className="btn" onClick={() => hibernateIdleTerminals()} disabled={idleCount === 0}>
              {idleCount === 0 ? "None idle" : `Hibernate ${idleCount} now`}
            </button>
          </SettingRow>
        </div>
      </SettingsBlock>
      <SettingsBlock label="Motion">
        <div className="settings-group">
          <SettingRow
            label="Reduce motion"
            hint={
              maxPerformance
                ? "Included in Maximum performance mode; your own choice comes back on Standard."
                : "Skips decorative animation and the sign-in backdrop video. The OS-level reduced-motion preference does this too; this switch works without it."
            }
          >
            <Switch label="Reduce motion" checked={settings.reduceMotion || maxPerformance} disabled={maxPerformance} onChange={(next) => void update({ reduceMotion: next })} />
          </SettingRow>
        </div>
      </SettingsBlock>
    </>
  );
}
