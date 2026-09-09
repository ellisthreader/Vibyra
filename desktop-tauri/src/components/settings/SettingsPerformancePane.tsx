import { GraphicsCard } from "./GraphicsCard";
import { PerformanceCard } from "./PerformanceCard";
import { SettingsBlock, type SettingsPaneProps } from "./SettingsShared";

/**
 * Every "make it faster" control in one place.
 *
 * The two cards are different axes and both belong here: Performance mode is
 * cross-platform, instant, and about how much work the app does; Graphics mode
 * picks a Linux compositing path and lands on the next launch, so it renders
 * itself away on macOS and Windows.
 */
export function SettingsPerformancePane({ settings, update }: SettingsPaneProps) {
  return (
    <>
      <SettingsBlock label="Performance mode">
        <PerformanceCard settings={settings} update={update} />
      </SettingsBlock>
      <GraphicsCard settings={settings} update={update} />
    </>
  );
}
