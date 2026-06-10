import { GoogleSignin } from "@react-native-google-signin/google-signin";
import * as AppleAuthentication from "expo-apple-authentication";
import { Platform } from "react-native";
import { appApiRequest } from "./appApi";

export type NativeAuthProvider = "apple" | "google";
export type NativeAuthCredential = {
  identityToken: string;
  challengeId?: string;
  name?: string;
  provider: NativeAuthProvider;
};

let googleConfigured = false;

export async function authenticateNativeProvider(provider: NativeAuthProvider): Promise<NativeAuthCredential> {
  return provider === "apple" ? authenticateWithApple() : authenticateWithGoogle();
}

async function authenticateWithGoogle(): Promise<NativeAuthCredential> {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  if (!webClientId) {
    throw new Error("Google Sign-In is not configured for this build.");
  }
  if (!googleConfigured) {
    GoogleSignin.configure({
      webClientId,
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() || undefined
    });
    googleConfigured = true;
  }
  if (Platform.OS === "android") {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  }

  const response = await GoogleSignin.signIn() as unknown as {
    data?: { idToken?: string | null; user?: { name?: string | null } };
    idToken?: string | null;
    user?: { name?: string | null };
  };
  const identityToken = response.data?.idToken ?? response.idToken;
  if (!identityToken) {
    throw new Error("Google did not return an identity token.");
  }

  return {
    provider: "google",
    identityToken,
    name: response.data?.user?.name ?? response.user?.name ?? undefined
  };
}

async function authenticateWithApple(): Promise<NativeAuthCredential> {
  if (Platform.OS !== "ios" || !await AppleAuthentication.isAvailableAsync()) {
    throw new Error("Sign in with Apple is not available on this device.");
  }
  const challenge = await appApiRequest<{ challengeId: string; nonce: string }>("/api/auth/provider/challenge", {
    method: "POST",
    body: JSON.stringify({ provider: "apple" })
  });
  const credential = await AppleAuthentication.signInAsync({
    nonce: challenge.nonce,
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL
    ]
  });
  if (!credential.identityToken) {
    throw new Error("Apple did not return an identity token.");
  }

  return {
    provider: "apple",
    challengeId: challenge.challengeId,
    identityToken: credential.identityToken,
    name: appleName(credential.fullName)
  };
}

function appleName(name: AppleAuthentication.AppleAuthenticationFullName | null) {
  if (!name) return undefined;
  const value = [name.givenName, name.familyName].filter(Boolean).join(" ").trim();
  return value || undefined;
}
