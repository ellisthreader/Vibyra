function googleIosUrlScheme(clientId) {
  const suffix = ".apps.googleusercontent.com";
  if (!clientId.endsWith(suffix)) {
    throw new Error("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID must end with .apps.googleusercontent.com");
  }

  return `com.googleusercontent.apps.${clientId.slice(0, -suffix.length)}`;
}

function recoveryLinkConfig() {
  const value = process.env.EXPO_PUBLIC_RECOVERY_LINK_URL?.trim()
    || "https://links.vibyra.app/reset-password";
  const url = new URL(value);
  if (
    url.protocol !== "https:"
    || url.pathname !== "/reset-password"
    || url.port
    || url.username
    || url.password
    || url.search
    || url.hash
  ) {
    throw new Error(
      "EXPO_PUBLIC_RECOVERY_LINK_URL must be an exact HTTPS /reset-password URL"
    );
  }

  return { host: url.hostname, path: url.pathname };
}

module.exports = ({ config }) => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  const plugins = [...(config.plugins ?? [])];
  const recoveryLink = recoveryLinkConfig();
  const recoveryIntentFilter = {
    action: "VIEW",
    autoVerify: true,
    data: [{
      scheme: "https",
      host: recoveryLink.host,
      path: recoveryLink.path
    }],
    category: ["BROWSABLE", "DEFAULT"]
  };

  if (iosClientId) {
    plugins.push([
      "@react-native-google-signin/google-signin",
      { iosUrlScheme: googleIosUrlScheme(iosClientId) }
    ]);
  }

  return {
    ...config,
    ios: {
      ...(config.ios ?? {}),
      associatedDomains: [
        ...new Set([
          ...(config.ios?.associatedDomains ?? []),
          `applinks:${recoveryLink.host}`
        ])
      ]
    },
    android: {
      ...(config.android ?? {}),
      intentFilters: [
        ...(config.android?.intentFilters ?? []).filter((filter) => !isRecoveryIntentFilter(filter)),
        recoveryIntentFilter
      ]
    },
    plugins
  };
};

function isRecoveryIntentFilter(filter) {
  return filter?.action === "VIEW"
    && filter?.autoVerify === true
    && (filter?.data ?? []).some((entry) => (
      entry?.scheme === "https"
      && entry?.path === "/reset-password"
    ));
}
