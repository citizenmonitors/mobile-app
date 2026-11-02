import { Platform } from "react-native";

import { apiRequest } from "@/lib/api/http";

export type PushPlatform = "ios" | "android";

export type RegisterPushTokenPayload = {
  token: string;
  platform: PushPlatform;
};

export type RegisterPushTokenResponse = {
  registered?: boolean;
  removed?: boolean;
  platform?: PushPlatform;
  message?: string;
};

function resolvePlatform(): PushPlatform {
  return Platform.OS === "ios" ? "ios" : "android";
}

// POST /profile/push-token  { token: "ExponentPushToken[...]", platform }
// → 200 { registered: true, platform }. Call after login and whenever Expo
// issues a new token; a token saved on another account (shared phone) moves
// to this one. The backend sends through Expo's Push API and removes tokens
// Expo reports as DeviceNotRegistered.
export async function registerPushToken(token: string): Promise<RegisterPushTokenResponse> {
  return apiRequest<RegisterPushTokenResponse>("/profile/push-token", {
    method: "POST",
    body: {
      token,
      platform: resolvePlatform(),
    },
  });
}

// DELETE /profile/push-token  { token } → 200 { removed: true }. Call on
// logout; safe to call more than once.
export async function unregisterPushToken(token: string): Promise<RegisterPushTokenResponse> {
  return apiRequest<RegisterPushTokenResponse>("/profile/push-token", {
    method: "DELETE",
    body: { token },
  });
}