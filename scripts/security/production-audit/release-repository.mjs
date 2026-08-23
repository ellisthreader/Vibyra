import { fail, pass } from "./findings.mjs";
import {
  defaultRoot,
  readJson
} from "./repository-files.mjs";

function buildPropertiesAndroid(expo) {
  const entry = (expo.plugins ?? []).find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "expo-build-properties"
  );
  return entry?.[1]?.android ?? {};
}

export function auditReleaseRepository(root = defaultRoot) {
  const results = [];
  let app;
  let eas;
  try {
    app = readJson(root, "app.json");
    eas = readJson(root, "eas.json");
  } catch (error) {
    return [fail("release.config.parse", `Cannot parse release configuration: ${error.message}`)];
  }

  const expo = app.expo ?? {};
  const androidBuild = buildPropertiesAndroid(expo);
  results.push(
    androidBuild.usesCleartextTraffic === false
      ? pass("release.android.cleartext", "Android cleartext traffic is disabled.")
      : fail("release.android.cleartext", "Android usesCleartextTraffic must be false.")
  );

  results.push(
    expo.runtimeVersion
      ? pass("release.expo.runtime", "Expo runtimeVersion is configured.")
      : fail("release.expo.runtime", "Expo runtimeVersion is required for OTA compatibility.")
  );

  results.push(
    typeof expo.ios?.config?.usesNonExemptEncryption === "boolean"
      ? pass("release.ios.export", "Expo export-compliance configuration is explicit.")
      : fail(
          "release.ios.export",
          "Set ios.config.usesNonExemptEncryption after cryptography export review."
        )
  );

  const associatedDomains = expo.ios?.associatedDomains ?? [];
  results.push(
    associatedDomains.some((value) => String(value).startsWith("applinks:"))
      ? pass("release.links.ios", "An iOS associated domain is configured.")
      : fail("release.links.ios", "Verified iOS Universal Links are not configured.")
  );

  const intentFilters = expo.android?.intentFilters ?? [];
  results.push(
    intentFilters.some((filter) => filter?.autoVerify === true)
      ? pass("release.links.android", "An auto-verified Android App Link is configured.")
      : fail("release.links.android", "Verified Android App Links are not configured.")
  );

  const production = eas.build?.production ?? {};
  results.push(
    eas.cli?.appVersionSource === "remote"
      ? pass("release.eas.version", "EAS uses remote version management.")
      : fail("release.eas.version", "EAS appVersionSource must be remote.")
  );
  results.push(
    production.autoIncrement === true
      ? pass("release.eas.increment", "Production build numbers auto-increment.")
      : fail("release.eas.increment", "Production autoIncrement must be true.")
  );
  results.push(
    production.channel === "production"
      ? pass("release.eas.channel", "Production builds use the production update channel.")
      : fail("release.eas.channel", "Production EAS channel must be production.")
  );

  const apiUrl = production.env?.EXPO_PUBLIC_API_URL ?? "";
  results.push(
    /^https:\/\//i.test(apiUrl)
      ? pass("release.api.https", "Production API URL uses HTTPS.")
      : fail("release.api.https", "Production API URL must use HTTPS.")
  );

  const desktopUrl = production.env?.EXPO_PUBLIC_DESKTOP_URL ?? "";
  results.push(
    !/^http:\/\//i.test(desktopUrl)
      ? pass("release.desktop.cleartext", "Production profile has no cleartext desktop URL.")
      : fail(
          "release.desktop.cleartext",
          "Production EXPO_PUBLIC_DESKTOP_URL must not use cleartext HTTP."
        )
  );

  return results;
}
