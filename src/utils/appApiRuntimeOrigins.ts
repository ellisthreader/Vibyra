import { Platform } from "react-native";
import {
  appApiRetryCandidates,
  approvedAppApiUrl,
  createAppApiOriginPolicy,
  isAllowedAppApiUrl
} from "./appApiOrigins";
import { getExpoHost } from "./network";

let runtimeAppApiUrl = "";

export function getAppApiUrl() {
  const policy = currentAppApiOriginPolicy();
  if (runtimeAppApiUrl && isAllowedAppApiUrl(policy, runtimeAppApiUrl)) return runtimeAppApiUrl;
  return policy.candidates[0];
}

export function rememberAppApiUrl(url: string) {
  const approvedUrl = approvedAppApiUrl(currentAppApiOriginPolicy(), url);
  if (!approvedUrl) return false;
  runtimeAppApiUrl = approvedUrl;
  return true;
}

export function getAppApiCandidateUrls() {
  return currentAppApiOriginPolicy().candidates;
}

export function getAppApiRetryCandidateUrls(failedApiUrl: string) {
  return appApiRetryCandidates(currentAppApiOriginPolicy(), failedApiUrl);
}

export function getAppApiFetchRedirect() {
  return currentAppApiOriginPolicy().redirect;
}

function currentAppApiOriginPolicy() {
  const host = getExpoHost();
  const developmentDefaultUrl = host && Platform.OS !== "web"
    ? `http://${host}:8000`
    : "http://127.0.0.1:8000";
  const webHost = getWebLocationHost();
  return createAppApiOriginPolicy({
    configuredUrl: process.env.EXPO_PUBLIC_API_URL,
    developmentDefaultUrl,
    developmentFallbackUrls: [
      host ? `http://${host}:8000` : "",
      webHost ? `http://${webHost}:8000` : "",
      Platform.OS === "web" ? "http://127.0.0.1:8000" : ""
    ],
    isDevelopment: __DEV__
  });
}

function getWebLocationHost() {
  if (Platform.OS !== "web") return "";
  return (globalThis as { location?: { hostname?: string } }).location?.hostname ?? "";
}
