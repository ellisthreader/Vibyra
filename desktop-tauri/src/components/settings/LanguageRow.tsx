import { LOCALES, type LocalePreference } from "../../../../mobile/src/i18n/locales";
import { setLocalePreference, useLocalePreference, useT } from "../../i18n";
import { SettingRow } from "./SettingsShared";

/** One row: the language Vibyra's menus are shown in. English until chosen. */
export function LanguageRow() {
  const t = useT();
  const [preference] = useLocalePreference();
  return (
    <SettingRow label={t("settings.language")} hint={t("settings.languageHint")}>
      <select className="input input--sm" aria-label={t("settings.language")} value={preference}
        onChange={(event) => setLocalePreference(event.target.value as LocalePreference)}>
        <option value="system">{t("settings.languageSystem")}</option>
        {LOCALES.map((locale) => <option key={locale.id} value={locale.id}>{locale.name}</option>)}
      </select>
    </SettingRow>
  );
}
