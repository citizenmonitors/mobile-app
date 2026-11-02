// Side-effect-only component that owns the entire push notification lifecycle:
// - Acquires the Expo push token on mount
// - Re-acquires when push token truly rotates
// - Syncs token to backend after user is authenticated
// - Handles foreground notifications, taps, and cold-start tap routing
// Must be rendered INSIDE AuthProvider so it can react to auth state.

import { Alert } from "react-native";
import { router } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import type { NotificationResponse } from "expo-notifications";

import { Paths } from "@/constants/paths";
import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/lib/api/http";
import { registerPushToken } from "@/lib/api/pushToken.api";
import {
  AppNotificationData,
  addExpoPushTokenListener,
  addForegroundNotificationListener,
  addNotificationResponseListener,
  canRegisterForRemotePushNotifications,
  clearLastNotificationResponseAsync,
  getLastNotificationResponseAsync,
  getNotificationDataFromResponse,
  registerForPushNotificationsAsync,
} from "@/lib/notifications";

// Both are gated by __DEV__, so neither affects production builds.

const DEV_SHOW_TOKEN_ALERT = false;
const DEV_LOG_FOREGROUND_NOTIFICATIONS = false;

// Keeps the boot token log once per JS runtime, even with React StrictMode or
// quick remounts during development.
let devLoggedExpoToken: string | null = null;

function serializeNativePushToken(token: unknown): string | null {
  if (!token || typeof token !== "object") return null;

  const maybeToken = token as {
    type?: unknown;
    data?: unknown;
  };

  try {
    const type =
      typeof maybeToken.type === "string" ? maybeToken.type : "unknown";

    const data =
      typeof maybeToken.data === "string"
        ? maybeToken.data
        : JSON.stringify(maybeToken.data);

    if (!data) return null;

    return `${type}:${data}`;
  } catch {
    return null;
  }
}

function tryParseJsonObject(value: unknown): AppNotificationData | null {
  if (!value) return null;

  if (typeof value === "object" && !Array.isArray(value)) {
    return value as AppNotificationData;
  }

  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as AppNotificationData;
    }

    return null;
  } catch {
    return null;
  }
}

function getStringFromData(
  data: AppNotificationData | null | undefined,
  keys: string[]
): string | null {
  if (!data) return null;

  for (const key of keys) {
    const value = data[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function getRouteDataFromNotificationResponse(
  response: NotificationResponse | null | undefined
): AppNotificationData | null {
  if (!response) return null;

  const content = response.notification.request.content;

  /**
   * Correct push payloads should put route metadata inside `data`.
   * But the current backend appears to be putting a JSON object inside the
   * visible push body, e.g.
   * body: {"slug":"...","articleId":"..."}
   *
   * So we merge both:
   *   - parsed body/title/subtitle if they contain JSON
   *   - content.data from Expo
   *
   * Explicit Expo data wins over parsed visible text.
   */
  const expoData = getNotificationDataFromResponse(response) ?? {};
  const parsedBody = tryParseJsonObject(content.body);
  const parsedSubtitle = tryParseJsonObject(content.subtitle);
  const parsedTitle = tryParseJsonObject(content.title);

  const nestedPayload =
    tryParseJsonObject(expoData.payload) ??
    tryParseJsonObject(expoData.metadata) ??
    tryParseJsonObject(expoData.meta) ??
    tryParseJsonObject(expoData.notification);

  const mergedData = {
    ...(parsedTitle ?? {}),
    ...(parsedSubtitle ?? {}),
    ...(parsedBody ?? {}),
    ...(nestedPayload ?? {}),
    ...expoData,
  } as AppNotificationData;

  return Object.keys(mergedData).length > 0 ? mergedData : null;
}

function isBareCitizenMonitorsUrl(url: string): boolean {
  const normalized = url.trim().toLowerCase();

  return (
    normalized === "citizenmonitors://" ||
    normalized === "citizenmonitors:///" ||
    normalized === "citizenmonitors:" ||
    normalized === "/"
  );
}

function normalizeInternalUrl(url: string): string | null {
  const trimmed = url.trim();

  if (!trimmed || isBareCitizenMonitorsUrl(trimmed)) {
    return null;
  }

  if (trimmed.startsWith("/")) {
    return trimmed;
  }

  if (trimmed.startsWith("citizenmonitors://")) {
    const withoutScheme = trimmed.replace(/^citizenmonitors:\/+/, "/");

    if (!withoutScheme || withoutScheme === "/") {
      return null;
    }

    if (withoutScheme.startsWith("/(app)") || withoutScheme.startsWith("/(public)")) {
      return withoutScheme;
    }

    /**
     * Friendly fallback if backend sends something like:
     * citizenmonitors://news/article-slug
     */
    if (withoutScheme.startsWith("/news/")) {
      return `/(app)${withoutScheme}`;
    }

    if (withoutScheme.startsWith("/notifications")) {
      return `/(app)${withoutScheme}`;
    }

    return withoutScheme;
  }

  return null;
}

function getArticleRouteKey(data: AppNotificationData | null): string | null {
  return getStringFromData(data, [
    "slug",
    "articleSlug",
    "newsSlug",
    "articleId",
    "newsId",
    "id",
  ]);
}

function isArticleNotification(data: AppNotificationData | null): boolean {
  if (!data) return false;

  const type =
    typeof data.type === "string" ? data.type.trim().toLowerCase() : "";

  const screen =
    typeof data.screen === "string" ? data.screen.trim().toLowerCase() : "";

  if (
    type.includes("news") ||
    type.includes("article") ||
    type.includes("insight") ||
    screen.includes("news") ||
    screen.includes("article") ||
    screen.includes("insight")
  ) {
    return true;
  }

  return Boolean(
    getStringFromData(data, [
      "slug",
      "articleSlug",
      "newsSlug",
      "articleId",
      "newsId",
    ])
  );
}

// Notification tap routing

function handleNotificationRoute(data: AppNotificationData | null): void {
  if (!data) return;

  /**
   * News/article notifications should go directly to the article details page.
   * This is intentionally checked before `url`, because the current backend
   * can send a bad bare URL like citizenmonitors:/// together with useful
   * article metadata.
   */
  if (isArticleNotification(data)) {
    const articleKey = getArticleRouteKey(data);

    if (articleKey) {
      router.push(Paths.newsDetails(articleKey) as never);
      return;
    }
  }

  const explicitUrl = getStringFromData(data, ["url", "deepLink", "link"]);

  if (explicitUrl) {
    const normalizedUrl = normalizeInternalUrl(explicitUrl);

    if (normalizedUrl) {
      router.push(normalizedUrl as never);
      return;
    }
  }

  // Pulse notifications (likes, comments, reposts) carry the post id.
  const pulsePostId = getStringFromData(data, ["postId", "pulsePostId"]);

  if (pulsePostId) {
    router.push(Paths.appPulsePost(pulsePostId) as never);
    return;
  }

  if (data.type === "result-submitted" && typeof data.collationId === "string") {
    router.push({
      pathname: "/(app)/election/[id]",
      params: { id: data.collationId },
    } as never);
    return;
  }

  if (data.type === "incident-reported" && typeof data.electionId === "string") {
    router.push({
      pathname: "/(app)/election/[id]",
      params: { id: data.electionId },
    } as never);
    return;
  }

  if (data.type === "polling-unit-alert") {
    router.push("/(app)/notifications" as never);
    return;
  }

  if (data.type === "discussion-reply") {
    router.push("/(app)/notifications" as never);
    return;
  }

  router.push("/(app)/notifications" as never);
}

// Backend sync helper

async function syncTokenToBackend(token: string): Promise<boolean> {
  try {
    await registerPushToken(token);

    if (__DEV__) {
      console.log("[NotificationsGate] token synced to backend ✓");
    }

    return true;
  } catch (err) {
    if (__DEV__) {
      const status = err instanceof ApiError ? err.status : null;

      if (status === 404) {
        // The push-token endpoint is not yet implemented on the backend.
        // Push notifications will not work until the backend adds it.
        // See: src/lib/api/pushToken.api.ts — confirm endpoint with backend engineer.
        console.warn(
          "[NotificationsGate] push token sync skipped — backend endpoint " +
            "POST /profile/push-token returned 404 (not found). " +
            "Confirm the correct endpoint path with the backend engineer."
        );
      } else if (status === 401) {
        // Auth token expired between token acquisition and the sync POST.
        // The auth system will handle re-login; this is not a push-notification bug.
        console.warn("[NotificationsGate] push token sync skipped — 401 unauthorized (auth expired mid-sync).");
      } else {
        console.error(
          `[NotificationsGate] push token sync failed (HTTP ${status ?? "network error"}):`,
          err
        );
      }
    }

    return false;
  }
}

export default function NotificationsGate(): null {
  const { isAuthenticated, isOnboardingComplete, token: authToken } = useAuth();

  const isAuthenticatedRef = useRef(isAuthenticated);
  const isOnboardingCompleteRef = useRef(isOnboardingComplete);
  const authTokenRef = useRef<string | null>(authToken ?? null);

  // Latest acquired Expo push token, updated on acquisition + true rotation.
  const currentExpoTokenRef = useRef<string | null>(null);

  // Last token we successfully POSTed to the backend.
  const lastSyncedTokenRef = useRef<string | null>(null);

  // Prevents duplicate backend POSTs for the same token while a request is still
  // in-flight.
  const syncInFlightTokenRef = useRef<string | null>(null);

  // Prevents token-rotation callbacks from repeatedly re-entering registration.
  const rotationRefreshInFlightRef = useRef(false);

  // Stores the last native APNs/FCM token event we handled. If Expo emits the
  // same native token repeatedly, we ignore the duplicates.
  const lastNativePushTokenRef = useRef<string | null>(null);

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
    isOnboardingCompleteRef.current = isOnboardingComplete;
    authTokenRef.current = authToken ?? null;
  }, [isAuthenticated, isOnboardingComplete, authToken]);

  const syncCurrentTokenIfNeeded = useCallback((): void => {
    const expoToken = currentExpoTokenRef.current;

    if (!isAuthenticatedRef.current) return;
    // Backend only accepts push token after the user has fully completed registration.
    if (!isOnboardingCompleteRef.current) return;
    if (!authTokenRef.current) return;
    if (!expoToken) return;

    if (lastSyncedTokenRef.current === expoToken) return;
    if (syncInFlightTokenRef.current === expoToken) return;

    syncInFlightTokenRef.current = expoToken;

    void syncTokenToBackend(expoToken)
      .then((synced) => {
        if (!synced) return;

        // Only mark as synced if this is still the active token.
        if (currentExpoTokenRef.current === expoToken) {
          lastSyncedTokenRef.current = expoToken;
        }
      })
      .finally(() => {
        if (syncInFlightTokenRef.current === expoToken) {
          syncInFlightTokenRef.current = null;
        }
      });
  }, []);

  // Effect 1: bootstrap + listeners

  useEffect(() => {
    let mounted = true;

    const boot = async (): Promise<void> => {
      const expoToken = await registerForPushNotificationsAsync();

      if (!mounted) return;

      if (expoToken) {
        currentExpoTokenRef.current = expoToken;

        if (__DEV__ && devLoggedExpoToken !== expoToken) {
          devLoggedExpoToken = expoToken;

          console.log(
            "\n========== EXPO PUSH TOKEN ==========\n" +
              expoToken +
              "\n=====================================\n"
          );

          if (DEV_SHOW_TOKEN_ALERT) {
            Alert.alert("Expo Push Token (DEV)", expoToken);
          }
        }

        // Handles the race where auth was already restored before token
        // acquisition completed.
        syncCurrentTokenIfNeeded();
      }

      // Handle cold-start: app was opened from killed state via notification tap.
      try {
        const lastResponse = await getLastNotificationResponseAsync();

        if (mounted && lastResponse) {
          const data = getRouteDataFromNotificationResponse(lastResponse);
          handleNotificationRoute(data);
          await clearLastNotificationResponseAsync();
        }
      } catch (err) {
        if (__DEV__) {
          console.warn("[NotificationsGate] cold-start handling failed:", err);
        }
      }
    };

    void boot();

    // Foreground notifications: the system banner shows automatically via
    // setNotificationHandler in lib/notifications.ts. This listener is for
    // optional side effects only.
    const foregroundSub = addForegroundNotificationListener((notification) => {
      if (__DEV__ && DEV_LOG_FOREGROUND_NOTIFICATIONS) {
        console.log(
          "[NotificationsGate] foreground notification:",
          notification.request.content
        );
      }
    });

    // Tap response: user tapped a notification from tray, banner, or lock screen.
    const responseSub = addNotificationResponseListener((response) => {
      const data = getRouteDataFromNotificationResponse(response);
      handleNotificationRoute(data);
    });

    // Do not subscribe to token rotation on unsupported simulator push flow.
    const tokenSub = canRegisterForRemotePushNotifications()
      ? addExpoPushTokenListener((nativeToken) => {
          const nativeTokenKey = serializeNativePushToken(nativeToken);

          if (
            nativeTokenKey &&
            lastNativePushTokenRef.current === nativeTokenKey
          ) {
            return;
          }

          if (nativeTokenKey) {
            lastNativePushTokenRef.current = nativeTokenKey;
          }

          if (rotationRefreshInFlightRef.current) {
            return;
          }

          rotationRefreshInFlightRef.current = true;

          void registerForPushNotificationsAsync({ forceRefresh: true })
            .then((newExpoToken) => {
              if (!mounted || !newExpoToken) return;

              const previousExpoToken = currentExpoTokenRef.current;

              // Critical loop-breaker: do not treat the same Expo token as a
              // real rotation.
              if (previousExpoToken === newExpoToken) {
                return;
              }

              currentExpoTokenRef.current = newExpoToken;
              lastSyncedTokenRef.current = null;

              if (__DEV__) {
                console.log(
                  "[NotificationsGate] Expo push token changed:",
                  newExpoToken
                );
              }

              syncCurrentTokenIfNeeded();
            })
            .finally(() => {
              rotationRefreshInFlightRef.current = false;
            });
        })
      : null;

    return () => {
      mounted = false;
      foregroundSub.remove();
      responseSub.remove();
      tokenSub?.remove();
    };
  }, [syncCurrentTokenIfNeeded]);

  // Effect 2: sync when auth becomes ready

  useEffect(() => {
    syncCurrentTokenIfNeeded();
  }, [isAuthenticated, isOnboardingComplete, authToken, syncCurrentTokenIfNeeded]);

  return null;
}