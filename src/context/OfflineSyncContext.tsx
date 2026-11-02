import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { useQueryClient } from "@tanstack/react-query";
import { AppState } from "react-native";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { pulseQueryKeys } from "@/hooks/api/usePulseQueries";
import { reportingQueryKeys } from "@/hooks/api/useReportingMutations";
import { collationReviewQueryKeys } from "@/hooks/api/useCollationReviewQueries";
import {
  mapDraftToElectionResultPayload,
  mapDraftToIncidentReportPayload,
  submitElectionResult,
  submitIncidentReport,
} from "@/lib/api/reporting.api";
import {
  submitCollationUserAction,
  CollationUserActionPayload,
} from "@/lib/api/collationReview.api";
import {
  createPulseComment,
  createPulsePost,
  likePulseComment,
  likePulsePost,
  unlikePulseComment,
  unlikePulsePost,
  PulseVisibilityScope,
} from "@/lib/api/pulse.api";
import { ElectionResultDraft, IncidentDraft } from "@/lib/reporting";
import { ApiError } from "@/lib/api/http";
import { useAppToast } from "@/hooks/useAppToast";

export type QueuedActionType =
  | "submit-election-report"
  | "submit-incident-report"
  | "pulse-create-post"
  | "pulse-like-post"
  | "pulse-create-comment"
  | "pulse-like-comment"
  | "collation-user-action";

export type QueuedAction = {
  id: string;
  type: QueuedActionType;
  payload: Record<string, unknown>;
  createdAt: number;
  synced: boolean;
  /**
   * True once the sync engine has given up retrying this item — the backend
   * gave a definitive rejection (a 4xx: bad request, validation failure, a
   * business rule like "you must submit a result before you can flag") that
   * will NEVER succeed no matter how many times it's retried. Distinct from
   * simply being unsynced: a failed item is done being retried but is kept
   * (not silently dropped) so its data and failure reason stay visible
   * rather than vanishing, or lying to the user with "Pending Sync" forever.
   */
  failed?: boolean;
  lastError?: string;
};

type OfflineSyncContextValue = {
  queue: QueuedAction[];
  enqueue: (action: Omit<QueuedAction, "id" | "createdAt" | "synced">) => void;
  isOnline: boolean;
  pendingCount: number;
};

type SyncResult = {
  ok: boolean;
  /**
   * Set when `ok` is false AND the failure is definitive (a 4xx rejection)
   * rather than a "try again later" condition (network failure, timeout,
   * 5xx). Permanent failures stop being retried.
   */
  permanent?: boolean;
  error?: string;
  invalidatePulse?: boolean;
  invalidateReportingElectionId?: string;
  invalidateCollationReviewElectionId?: string;
};

const STORAGE_KEY = "@citizen_monitors/offline_queue";

const OfflineSyncContext = createContext<OfflineSyncContextValue | null>(null);

async function persistQueue(items: QueuedAction[]) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Best effort only.
  }
}

// Serializes AsyncStorage writes so they always land in the order they were
// issued. Without this, two overlapping persistQueue calls — e.g. one from
// enqueue() firing while a runSync() pass is mid-upload — can resolve out of
// order: the write that STARTED first but FINISHES last silently overwrites
// newer queue contents with stale ones on disk, permanently dropping
// whatever the newer write added. There is only ever one OfflineSyncProvider
// mounted, so a module-level chain (rather than a ref) is correct here.
let persistChain: Promise<void> = Promise.resolve();
function schedulePersist(items: QueuedAction[]): Promise<void> {
  persistChain = persistChain.then(() => persistQueue(items));
  return persistChain;
}

function getString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === "string" ? value.trim() : "";
}

function getNullableString(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const value = payload[key];

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getBoolean(payload: Record<string, unknown>, key: string): boolean {
  return payload[key] === true;
}

function getVisibilityScope(
  payload: Record<string, unknown>,
): PulseVisibilityScope {
  const scope = payload.visibilityScope;

  return scope === "state" ||
    scope === "lga" ||
    scope === "ward" ||
    scope === "polling-unit"
    ? scope
    : "all";
}

function getElectionId(payload: Record<string, unknown>): string {
  return getString(payload, "electionId") || getString(payload, "election");
}

/** Human-friendly label for a permanently-failed queued item's toast. */
function describeFailedQueueItem(type: QueuedActionType, error: string): string {
  switch (type) {
    case "submit-election-report":
      return `Your election result couldn't be submitted: ${error}`;
    case "submit-incident-report":
      return `Your incident report couldn't be submitted: ${error}`;
    case "collation-user-action":
      return `Your action on that report couldn't be saved: ${error}`;
    case "pulse-create-post":
      return `Your post couldn't be shared: ${error}`;
    case "pulse-create-comment":
      return `Your comment couldn't be posted: ${error}`;
    case "pulse-like-post":
    case "pulse-like-comment":
      return `That like couldn't be saved: ${error}`;
    default:
      return error;
  }
}

function getElectionFeedback(payload: Record<string, unknown>) {
  return {
    rating: getString(payload, "rating") as "good" | "manageable" | "poor" | "",
    intimidationToday: getString(payload, "intimidationToday") as
      | "yes"
      | "no"
      | "",
    voteBuyingToday: getString(payload, "voteBuyingToday") as "yes" | "no" | "",
  };
}

async function syncQueuedAction(item: QueuedAction): Promise<SyncResult> {
  try {
    switch (item.type) {
      case "pulse-create-post": {
        const body = getString(item.payload, "body");

        if (!body) {
          return { ok: true };
        }

        await createPulsePost({
          body,
          visibilityScope: getVisibilityScope(item.payload),
          useAnonymousDisplay: getBoolean(item.payload, "useAnonymousDisplay"),
          imageUri: getNullableString(item.payload, "imageUri"),
        });

        return { ok: true, invalidatePulse: true };
      }

      case "pulse-like-post": {
        const postId = getString(item.payload, "postId");

        if (!postId) {
          return { ok: true };
        }

        // Older queued items have no `liked` flag; they were always likes.
        if (item.payload.liked === false) {
          await unlikePulsePost(postId);
        } else {
          await likePulsePost(postId);
        }

        return { ok: true, invalidatePulse: true };
      }

      case "pulse-create-comment": {
        const postId = getString(item.payload, "postId");
        const body = getString(item.payload, "body");

        if (!postId || !body) {
          return { ok: true };
        }

        await createPulseComment({
          postId,
          payload: {
            body,
            useAnonymousDisplay: getBoolean(
              item.payload,
              "useAnonymousDisplay",
            ),
          },
        });

        return { ok: true, invalidatePulse: true };
      }

      case "pulse-like-comment": {
        const postId = getString(item.payload, "postId");
        const commentId = getString(item.payload, "commentId");

        if (!postId || !commentId) {
          return { ok: true };
        }

        if (item.payload.liked === false) {
          await unlikePulseComment({ postId, commentId });
        } else {
          await likePulseComment({ postId, commentId });
        }

        return { ok: true, invalidatePulse: true };
      }

      case "submit-election-report": {
        const electionId = getElectionId(item.payload);

        // A queued item missing its election id can never be submitted — but
        // treating that as "ok" would silently drop real user data (looks
        // synced, nothing ever reaches the backend). Keep it queued instead;
        // it's a bug to investigate, not a fire we should paper over.
        if (!electionId) {
          console.log(
            "Queued submit-election-report is missing electionId — keeping queued.",
          );
          return { ok: false };
        }

        await submitElectionResult(
          mapDraftToElectionResultPayload({
            draft: item.payload as unknown as ElectionResultDraft,
            feedback: getElectionFeedback(item.payload),
          }),
        );

        return { ok: true, invalidateReportingElectionId: electionId };
      }

      case "submit-incident-report": {
        const electionId = getElectionId(item.payload);

        if (!electionId) {
          console.log(
            "Queued submit-incident-report is missing electionId — keeping queued.",
          );
          return { ok: false };
        }

        await submitIncidentReport(
          mapDraftToIncidentReportPayload(
            item.payload as unknown as IncidentDraft,
          ),
        );

        return { ok: true, invalidateReportingElectionId: electionId };
      }

      case "collation-user-action": {
        const electionId = getElectionId(item.payload);
        const targetId = getString(item.payload, "targetId");
        const action = getString(item.payload, "action");
        const dataType = getString(item.payload, "dataType");

        if (!electionId || !targetId || !action || !dataType) {
          console.log(
            "Queued collation-user-action is missing required fields — keeping queued.",
          );
          return { ok: false };
        }

        await submitCollationUserAction({
          electionId,
          payload: {
            targetId,
            action: action as CollationUserActionPayload["action"],
            dataType: dataType as CollationUserActionPayload["dataType"],
            flagReason: getNullableString(item.payload, "flagReason") ?? undefined,
          },
        });

        return { ok: true, invalidateCollationReviewElectionId: electionId };
      }

      default:
        return { ok: false };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.log(
      `Sync failed for queued "${item.type}" (id ${item.id}):`,
      message,
    );

    // A 4xx from the backend (validation failure, business rule rejection —
    // e.g. "you must submit a result before you can flag") is a definitive
    // "no", not a "try again later". Retrying it every 15 seconds forever
    // can never make it succeed; it just burns battery/data while the UI
    // dishonestly says "Pending Sync" on something that's already dead.
    // Network failures, timeouts, and 5xx server errors are NOT marked
    // permanent — those genuinely can resolve on the next attempt.
    const permanent =
      error instanceof ApiError && error.status >= 400 && error.status < 500;

    return { ok: false, permanent, error: message };
  }
}

// How often we retry the pending queue even when nothing else has changed.
// This is the single most important number in this file: without a timer
// like this, a sync attempt that fails once (a dropped connection mid
// upload, a cold-start race, a NetInfo false negative) never gets retried
// until the NEXT unrelated queue mutation or connectivity flip — which can
// be minutes or hours later, or never. Real offline-first apps (Notion,
// WhatsApp, Linear) all poll a pending outbox on an interval for exactly
// this reason.
const RETRY_INTERVAL_MS = 15_000;

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { showToast } = useAppToast();

  const [queue, setQueue] = useState<QueuedAction[]>([]);
  const [isOnline, setIsOnline] = useState(true);

  // The single source of truth for queue reads and writes. `enqueue` and
  // `runSync` both mutate THIS synchronously and then call `setQueue` to
  // mirror it into React state for rendering — never the other way around.
  // An earlier version mirrored ref-from-state via a `useEffect`, which was
  // a real bug: a state update queued by one write could commit AFTER a
  // newer synchronous ref mutation from a concurrent write, and the effect
  // would silently overwrite the ref with stale contents — permanently
  // dropping whatever the newer write had added (e.g. a "like" tapped while
  // a large evidence video was still mid-upload in the background).
  const queueRef = useRef<QueuedAction[]>([]);

  const syncingRef = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (!raw) return;

      try {
        const parsed = JSON.parse(raw) as QueuedAction[];
        const restored = parsed.filter((item) => !item.synced);
        queueRef.current = restored;
        setQueue(restored);
      } catch {
        // Ignore corrupted queue.
      }
    });
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(
        Boolean(state.isConnected) && state.isInternetReachable !== false,
      );
    });

    return unsubscribe;
  }, []);

  const enqueue = useCallback(
    (action: Omit<QueuedAction, "id" | "createdAt" | "synced">) => {
      const item: QueuedAction = {
        ...action,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: Date.now(),
        synced: false,
      };

      // Synchronous: queueRef.current must reflect this new item
      // immediately — a runSync() pass could be mid-await right now and
      // will re-read queueRef.current before it next persists.
      const next = [...queueRef.current, item];
      queueRef.current = next;
      setQueue(next);
      void schedulePersist(next);
    },
    [],
  );

  // The actual sync pass. Deliberately does NOT gate on `isOnline` — that
  // flag comes from NetInfo's reachability heuristic, which can read false
  // on some networks/devices even when the API is perfectly reachable. The
  // real connectivity test is just making the request: if we're truly
  // offline it fails fast and the item stays queued for the next attempt,
  // same as if the check had blocked it — but a wrong "offline" reading can
  // never permanently wedge the queue.
  const runSync = useCallback(async () => {
    if (syncingRef.current) return;

    // Failed items are excluded — the sync engine has already given up
    // retrying them (a definitive 4xx rejection), so they're not "pending"
    // anymore even though they're still unsynced.
    const pending = queueRef.current.filter(
      (item) => !item.synced && !item.failed,
    );
    if (!pending.length) return;

    syncingRef.current = true;

    try {
      let shouldInvalidatePulse = false;
      const reportingElectionIds = new Set<string>();
      const collationReviewElectionIds = new Set<string>();
      // IDs synced/failed during THIS pass. Never derive the next queue
      // snapshot from a variable captured at the top of the function —
      // queueRef.current is re-read fresh on every iteration below, so a
      // concurrent enqueue() that lands mid-await (this loop awaits a real
      // network call per item, which can take up to 3 minutes for a
      // multipart upload) is folded in rather than clobbered.
      const syncedIds = new Set<string>();
      const failedErrors = new Map<string, string>();
      const newlyFailed: { item: QueuedAction; error: string }[] = [];

      for (const item of pending) {
        const result = await syncQueuedAction(item);

        if (!result.ok) {
          if (result.permanent) {
            const message = result.error ?? "This couldn't be submitted.";
            failedErrors.set(item.id, message);
            newlyFailed.push({ item, error: message });

            const next = queueRef.current.map((entry) =>
              failedErrors.has(entry.id)
                ? { ...entry, failed: true, lastError: failedErrors.get(entry.id) }
                : entry,
            );

            queueRef.current = next;
            setQueue(next);
            await schedulePersist(next);
          }

          continue;
        }

        if (result.invalidatePulse) {
          shouldInvalidatePulse = true;
        }

        if (result.invalidateReportingElectionId) {
          reportingElectionIds.add(result.invalidateReportingElectionId);
        }

        if (result.invalidateCollationReviewElectionId) {
          collationReviewElectionIds.add(result.invalidateCollationReviewElectionId);
        }

        syncedIds.add(item.id);

        const next = queueRef.current.map((entry) =>
          syncedIds.has(entry.id) ? { ...entry, synced: true } : entry,
        );

        queueRef.current = next;
        setQueue(next);
        await schedulePersist(next);
      }

      // Failed items are kept (data + reason preserved for Digital Vault to
      // show), only truly synced ones are dropped from the stored queue.
      const compacted = queueRef.current.filter((item) => !item.synced);

      queueRef.current = compacted;
      setQueue(compacted);
      await schedulePersist(compacted);

      // One toast per newly-failed item — turns an invisible perpetual
      // "Pending Sync" into something the user actually sees and can act on
      // (or relay back as a bug report) instead of staring at a stuck spinner.
      newlyFailed.forEach(({ item, error }) => {
        showToast({
          type: "error",
          message: describeFailedQueueItem(item.type, error),
        });
      });

      if (shouldInvalidatePulse) {
        void queryClient.invalidateQueries({
          queryKey: pulseQueryKeys.posts,
        });
      }

      if (reportingElectionIds.size > 0) {
        void queryClient.invalidateQueries({
          queryKey: reportingQueryKeys.dashboard,
        });
        void queryClient.invalidateQueries({
          queryKey: reportingQueryKeys.electionVault,
        });
        void queryClient.invalidateQueries({
          queryKey: reportingQueryKeys.collation,
        });

        reportingElectionIds.forEach((electionId) => {
          void queryClient.invalidateQueries({
            queryKey: reportingQueryKeys.electionCollation(electionId),
          });
          // The submission just synced — cards showing "Submitted" derived
          // this instantly from the local queue, but now that the queue
          // entry is gone, this refetch is what keeps them showing
          // "Submitted" going forward (server-confirmed, not just local).
          void queryClient.invalidateQueries({
            queryKey: reportingQueryKeys.mySubmission(electionId),
          });
        });
      }

      collationReviewElectionIds.forEach((electionId) => {
        void queryClient.invalidateQueries({
          queryKey: collationReviewQueryKeys.feed(electionId),
        });
      });
    } finally {
      syncingRef.current = false;
    }
  }, [queryClient, showToast]);

  // Trigger 1: any queue mutation (new item enqueued, or a previous pass
  // just marked something synced).
  useEffect(() => {
    void runSync();
  }, [queue, runSync]);

  // Trigger 2: connectivity coming back.
  useEffect(() => {
    if (isOnline) void runSync();
  }, [isOnline, runSync]);

  // Trigger 3: app returning to the foreground — the most common moment a
  // user's connection has actually changed since they last looked.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void runSync();
    });

    return () => subscription.remove();
  }, [runSync]);

  // Trigger 4: the safety net. Retries on a fixed cadence regardless of
  // what NetInfo or AppState think is happening, so a queue item can never
  // sit untouched indefinitely.
  useEffect(() => {
    const interval = setInterval(() => {
      void runSync();
    }, RETRY_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [runSync]);

  const pendingCount = useMemo(() => {
    // Failed items are excluded — they're done retrying, not "pending".
    return queue.filter((item) => !item.synced && !item.failed).length;
  }, [queue]);

  const value = useMemo(
    () => ({
      queue,
      enqueue,
      isOnline,
      pendingCount,
    }),
    [queue, enqueue, isOnline, pendingCount],
  );

  return (
    <OfflineSyncContext.Provider value={value}>
      {children}
    </OfflineSyncContext.Provider>
  );
}

export function useOfflineSync() {
  const context = useContext(OfflineSyncContext);

  if (!context) {
    throw new Error("useOfflineSync must be used within OfflineSyncProvider");
  }

  return context;
}
