// Community Verification — real backend-backed (GET/POST
// /elections/:id/collation/user-action). Replaces the old local-mock
// implementation entirely.

import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import {
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from "react-native";
import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import AppText from "@/components/ui/AppText";
import CollationAnimatedProgressBar from "@/components/collation/CollationAnimatedProgressBar";
import FlagReasonBottomSheet, {
  FlagReasonSheetHandle,
} from "@/components/collation/FlagReasonBottomSheet";
import ReviewReportsSkeleton from "@/components/collation/ReviewReportsSkeleton";
import SeeEvidenceBottomSheet, {
  EvidencePayload,
} from "@/components/collation/SeeEvidenceBottomSheet";
import PartyLogo from "@/components/shared/PartyLogo";
import { useAuth } from "@/context/AuthContext";
import { useOfflineSync } from "@/context/OfflineSyncContext";
import { useAppToast } from "@/hooks/useAppToast";
import {
  collationReviewQueryKeys,
  useCollationReviewFeedQuery,
} from "@/hooks/api/useCollationReviewQueries";
import {
  CollationReviewAction,
  CollationReviewIncidentItem,
  CollationReviewResultItem,
  CollationUserActionResponse,
} from "@/lib/api/collationReview.api";
import { formatTimeAgo } from "@/lib/formatTimeAgo";
import { CollationItem, formatCompactNumber } from "@/data/collation";
import { Theme } from "@/theme";
import NoElection from "@/svgs/app/NoElection";
import Incident from "@/svgs/app/collation/Incident";

type Props = {
  collation: CollationItem;
  refreshing?: boolean;
  onRefresh?: () => void;
};

type FlagTarget = {
  targetId: string;
  dataType: "election" | "incident";
};

const PARTY_COLORS: Record<string, string> = {
  APC: "#E84C3D",
  LP: "#17A34A",
  PDP: "#3C63E5",
  NNPP: "#F29B2F",
};
const DEFAULT_PARTY_COLOR = "#C8CDD7";

function getPartyColor(code: string): string {
  return PARTY_COLORS[code.trim().toUpperCase()] ?? DEFAULT_PARTY_COLOR;
}

function getMinutesAgo(dateValue?: string): number {
  if (!dateValue) return 0;

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return 0;
  }

  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
}

function findMyAction(
  actions: CollationReviewAction[],
  userId: string | null
): CollationReviewAction | undefined {
  if (!userId) return undefined;
  return actions.find((action) => action.userId === userId);
}

/**
 * Offline-first: agree/unagree/flag update the on-screen list INSTANTLY by
 * patching the cached feed directly, before the real network call ever
 * happens. `enqueue()` (see below) hands the actual delivery to
 * OfflineSyncContext, which retries in the background whether we're online
 * or not. The user never waits on a network round-trip to see their tap
 * register.
 */
function applyOptimisticReviewAction(
  current: CollationUserActionResponse | undefined,
  params: {
    targetId: string;
    dataType: "election" | "incident";
    action: "agree" | "unagree" | "flag" | "unflag";
    myUserId: string;
    flagReason?: string;
  }
): CollationUserActionResponse | undefined {
  if (!current) return current;

  const patchActions = (
    actions: CollationReviewAction[]
  ): CollationReviewAction[] => {
    const withoutMine = actions.filter((a) => a.userId !== params.myUserId);

    if (params.action === "unagree" || params.action === "unflag") {
      return withoutMine;
    }

    return [
      ...withoutMine,
      {
        userId: params.myUserId,
        action: params.action,
        _id: `local-${Date.now()}`,
        flagReason: params.flagReason,
      },
    ];
  };

  if (params.dataType === "election") {
    return {
      ...current,
      results: {
        ...current.results,
        results: current.results.results.map((item) =>
          item.electionId === params.targetId
            ? {
                ...item,
                actions: patchActions(item.actions),
                agreed: params.action === "agree" ? true : item.agreed,
                flagged: params.action === "flag" ? true : item.flagged,
              }
            : item
        ),
      },
    };
  }

  return {
    ...current,
    results: {
      ...current.results,
      incidentReports: current.results.incidentReports.map((item) =>
        item.electionId === params.targetId
          ? {
              ...item,
              actions: patchActions(item.actions),
              agreed: params.action === "agree" ? true : item.agreed,
              flagged: params.action === "flag" ? true : item.flagged,
            }
          : item
      ),
    },
  };
}

export default function CollationReviewReportsTab({
  collation,
  refreshing: externalRefreshing,
  onRefresh: externalRefresh,
}: Props) {
  const { showToast } = useAppToast();
  const { user } = useAuth();
  const myUserId = user?.id ?? null;
  const queryClient = useQueryClient();
  const { enqueue, isOnline } = useOfflineSync();

  const electionId = collation.id;
  const feedQuery = useCollationReviewFeedQuery(electionId);

  const evidenceRef = useRef<BottomSheetModal>(null);
  const flagRef = useRef<FlagReasonSheetHandle>(null);
  const [selectedEvidence, setSelectedEvidence] =
    useState<EvidencePayload | null>(null);
  const [flagTarget, setFlagTarget] = useState<FlagTarget | null>(null);

  const refreshing = externalRefreshing ?? feedQuery.isRefetching;

  const onRefresh = useCallback(() => {
    void feedQuery.refetch();
    externalRefresh?.();
  }, [externalRefresh, feedQuery]);

  const results = feedQuery.data?.results.results ?? [];
  const incidents = feedQuery.data?.results.incidentReports ?? [];

  const buildResultEvidence = useCallback(
    (item: CollationReviewResultItem): EvidencePayload => ({
      title: `${item.electionName} Result`,
      imageUri: item.resultPicture?.url,
      videoUri: item.resultVideo?.url,
      note: `Signed result sheet captured at ${item.pollingUnit}.`,
      accreditedVoter: formatCompactNumber(
        collation.officialSummary.accreditedVoters
      ),
      rejectedVotes: formatCompactNumber(collation.officialSummary.rejectedVotes),
      spoiledBallots: formatCompactNumber(
        collation.officialSummary.spoiledBallots
      ),
      usedBallots: formatCompactNumber(collation.officialSummary.usedBallots),
      unusedBallots: formatCompactNumber(collation.officialSummary.unusedBallots),
      locationMeta: item.pollingUnit,
      pollingUnitName: item.pollingUnit,
      pollingUnitCode: item.pollingUnit,
      observerHandle: "Field Observer",
      submittedAt: formatTimeAgo(getMinutesAgo(item.uploadedAt)),
      verificationStatus: item.agreed ? "verified" : "pending",
      sourceType: "observer-upload",
      electionName: collation.fullTitle,
    }),
    [collation]
  );

  const buildIncidentEvidence = useCallback(
    (item: CollationReviewIncidentItem): EvidencePayload => ({
      title: item.selectIncident,
      imageUri: item.incidentPictures?.[0]?.url,
      videoUri: item.incidentVideos?.[0]?.url,
      note: item.incidentNote,
      locationMeta: item.pollingUnit,
      pollingUnitName: item.pollingUnit,
      pollingUnitCode: item.pollingUnit,
      observerHandle: "Field Observer",
      submittedAt: formatTimeAgo(getMinutesAgo(item.uploadedAt)),
      verificationStatus: item.agreed ? "verified" : "pending",
      sourceType: "community-report",
      electionName: collation.fullTitle,
    }),
    [collation]
  );

  const openResultEvidence = useCallback(
    (item: CollationReviewResultItem) => {
      setSelectedEvidence(buildResultEvidence(item));
      requestAnimationFrame(() => evidenceRef.current?.present());
    },
    [buildResultEvidence]
  );

  const openIncidentEvidence = useCallback(
    (item: CollationReviewIncidentItem) => {
      setSelectedEvidence(buildIncidentEvidence(item));
      requestAnimationFrame(() => evidenceRef.current?.present());
    },
    [buildIncidentEvidence]
  );

  // ── Offline-first core: patch the cache instantly, then hand delivery to
  // OfflineSyncContext's background queue. The user sees the result of their
  // tap immediately, whether they're online or not — the actual network
  // call happens later (or right away, if online) without blocking the UI.
  const queueReviewAction = useCallback(
    (params: {
      targetId: string;
      dataType: FlagTarget["dataType"];
      action: "agree" | "unagree" | "flag" | "unflag";
      flagReason?: string;
    }) => {
      const effectiveUserId = myUserId ?? "local-user";

      queryClient.setQueryData<CollationUserActionResponse>(
        collationReviewQueryKeys.feed(electionId),
        (current) =>
          applyOptimisticReviewAction(current, {
            ...params,
            myUserId: effectiveUserId,
          })
      );

      enqueue({
        type: "collation-user-action",
        payload: {
          electionId,
          targetId: params.targetId,
          action: params.action,
          dataType: params.dataType,
          ...(params.flagReason ? { flagReason: params.flagReason } : {}),
        },
      });
    },
    [electionId, enqueue, myUserId, queryClient]
  );

  const handleConfirm = useCallback(
    (targetId: string, dataType: FlagTarget["dataType"], isCurrentlyAgreed: boolean) => {
      queueReviewAction({
        targetId,
        dataType,
        action: isCurrentlyAgreed ? "unagree" : "agree",
      });

      showToast({
        type: "success",
        message: isCurrentlyAgreed
          ? "Confirmation undone."
          : isOnline
            ? "Report confirmed — thank you."
            : "Confirmed offline — will sync automatically once you're back online.",
      });
    },
    [isOnline, queueReviewAction, showToast]
  );

  const handleOpenFlag = useCallback((target: FlagTarget) => {
    setFlagTarget(target);
    flagRef.current?.present();
  }, []);

  const handleUnflag = useCallback(
    (target: FlagTarget) => {
      Alert.alert(
        "Remove your flag?",
        "Your flag on this report will be withdrawn.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove flag",
            onPress: () => {
              queueReviewAction({ ...target, action: "unflag" });
              showToast({ type: "success", message: "Flag removed." });
            },
          },
        ],
      );
    },
    [queueReviewAction, showToast],
  );

  const handleFlagSubmit = useCallback(
    (reason: string) => {
      if (!flagTarget) return;

      queueReviewAction({ ...flagTarget, action: "flag", flagReason: reason });

      flagRef.current?.dismiss();
      showToast({
        type: "success",
        message: isOnline
          ? "Report flagged — evidence under review."
          : "Flagged offline — will sync automatically once you're back online.",
      });
    },
    [flagTarget, isOnline, queueReviewAction, showToast]
  );

  const handleShareResult = useCallback(
    async (item: CollationReviewResultItem) => {
      const totalVotes = item.partiesVotes.reduce((sum, p) => sum + p.count, 0);
      const partyLines = item.partiesVotes
        .map((p) => {
          const percent = totalVotes > 0 ? Math.round((p.count / totalVotes) * 100) : 0;
          return `${p.party}: ${formatCompactNumber(p.count)} votes (${percent}%)`;
        })
        .join("\n");

      const message = [
        `📊 ${collation.fullTitle}`,
        "",
        "Result Report — EC8A",
        `Polling Unit: ${item.pollingUnit}`,
        "",
        partyLines,
        "",
        "Shared via Citizen Monitors",
      ].join("\n");

      try {
        await Share.share({ message });
      } catch {
        showToast({ type: "error", message: "Unable to share right now." });
      }
    },
    [collation.fullTitle, showToast]
  );

  const handleShareIncident = useCallback(
    async (item: CollationReviewIncidentItem) => {
      const message = [
        `📊 ${collation.fullTitle}`,
        "",
        `⚠️ ${item.selectIncident}`,
        `Polling Unit: ${item.pollingUnit}`,
        "",
        item.incidentNote,
        "",
        "Shared via Citizen Monitors",
      ].join("\n");

      try {
        await Share.share({ message });
      } catch {
        showToast({ type: "error", message: "Unable to share right now." });
      }
    },
    [collation.fullTitle, showToast]
  );

  // Agree / flag only work while the election is live; viewing stays open.
  const canAct = collation.status === "live";

  const isInitialLoading = feedQuery.isLoading;
  const hasError = feedQuery.isError && results.length === 0 && incidents.length === 0;
  const isEmpty = !isInitialLoading && !hasError && results.length === 0 && incidents.length === 0;

  return (
    <>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Theme.colors.primary}
            colors={[Theme.colors.primary]}
          />
        }
      >
        <View style={styles.section}>
          <AppText style={styles.sectionTitle}>Community Verification</AppText>
          <AppText style={styles.sectionSubtitle}>
            Review reports submitted by observers for {collation.fullTitle}.
            Confirm what&apos;s accurate, and flag what&apos;s false.
          </AppText>
        </View>

        {isInitialLoading ? (
          <ReviewReportsSkeleton />
        ) : hasError ? (
          <View style={styles.emptyWrap}>
            <NoElection width={110} height={110} />
            <AppText style={styles.emptyTitle}>
              Couldn&apos;t load reports
            </AppText>
            <AppText style={styles.emptySubtitle}>
              {feedQuery.error instanceof Error && feedQuery.error.message
                ? feedQuery.error.message
                : "Pull down to try again."}
            </AppText>
          </View>
        ) : isEmpty ? (
          <View style={styles.emptyWrap}>
            <NoElection width={110} height={110} />
            <AppText style={styles.emptyTitle}>No Reports to Review Yet</AppText>
            <AppText style={styles.emptySubtitle}>
              Reports submitted by observers will appear here for community
              verification.
            </AppText>
          </View>
        ) : (
          <>
            {/* ── Result reports ── */}
            {results.map((item) => {
              const myAction = findMyAction(item.actions, myUserId);
              const totalVotes = item.partiesVotes.reduce(
                (sum, p) => sum + p.count,
                0
              );

              return (
                <View key={item.electionId}>
                  <View style={styles.resultHeaderRow}>
                    <View style={styles.resultDotRow}>
                      <View style={styles.redDot} />
                      <AppText style={styles.resultLabel} numberOfLines={1}>
                        Result Report — EC8A
                      </AppText>
                    </View>
                    <View style={styles.timeRow}>
                      <Ionicons
                        name="time-outline"
                        size={12}
                        color={Theme.colors.textMuted}
                      />
                      <AppText style={styles.timeText}>
                        {formatTimeAgo(getMinutesAgo(item.uploadedAt))}
                      </AppText>
                    </View>
                  </View>

                  <View style={styles.resultCard}>
                    <AppText style={styles.resultElectionTitle} numberOfLines={2}>
                      {item.electionName} Result
                    </AppText>
                    {item.partiesVotes.map((party) => {
                      const percent =
                        totalVotes > 0
                          ? Math.round((party.count / totalVotes) * 100)
                          : 0;
                      const color = getPartyColor(party.party);

                      return (
                        <View key={party._id} style={styles.partyBlock}>
                          <View style={styles.partyTopRow}>
                            <View style={styles.partyLeftGroup}>
                              <PartyLogo code={party.party} size={26} />
                              <AppText style={styles.partyName} numberOfLines={1}>
                                {party.party} ({formatCompactNumber(party.count)}{" "}
                                votes)
                              </AppText>
                            </View>
                            <AppText style={[styles.partyPercent, { color }]}>
                              {percent}%
                            </AppText>
                          </View>
                          <CollationAnimatedProgressBar
                            progress={percent}
                            height={6}
                            color={color}
                            trackColor="#E5E7EB"
                          />
                        </View>
                      );
                    })}
                  </View>

                  <View style={styles.resultFooter}>
                    <Pressable onPress={() => openResultEvidence(item)} hitSlop={8}>
                      <AppText style={styles.linkText}>
                        See Evidence Here &gt;
                      </AppText>
                    </Pressable>
                    <AppText style={styles.reviewCount}>
                      {item.actions.length} People have reviewed
                    </AppText>
                    <ActionRow
                      myAction={myAction}
                      onConfirm={() =>
                        handleConfirm(
                          item.electionId,
                          "election",
                          myAction?.action === "agree"
                        )
                      }
                      onFlag={() =>
                        handleOpenFlag({
                          targetId: item.electionId,
                          dataType: "election",
                        })
                      }
                      onUnflag={() =>
                        handleUnflag({
                          targetId: item.electionId,
                          dataType: "election",
                        })
                      }
                      canAct={canAct}
                      onShare={() => void handleShareResult(item)}
                    />
                  </View>
                  <View style={styles.sectionDivider} />
                </View>
              );
            })}

            {/* ── Incident header ── */}
            {incidents.length > 0 ? (
              <View style={styles.incidentSectionHeader}>
                <AppText style={styles.incidentSectionTitle}>
                  Incidents during {collation.fullTitle}
                </AppText>
              </View>
            ) : null}

            {/* ── Incidents with thread line ── */}
            {incidents.map((item, index) => {
              const isLast = index === incidents.length - 1;
              const myAction = findMyAction(item.actions, myUserId);

              return (
                <View key={item.electionId} style={styles.incidentRow}>
                  <View style={styles.incidentLeftCol}>
                    <View style={styles.incidentIconWrap}>
                      <Incident width={40} height={40} />
                    </View>
                    {!isLast ? <View style={styles.threadLine} /> : null}
                  </View>

                  <View style={styles.incidentContent}>
                    <View style={styles.incidentHeadRow}>
                      <View style={{ flex: 1 }}>
                        <AppText style={styles.incidentLabel}>Incident:</AppText>
                        <AppText style={styles.incidentTime}>
                          {formatTimeAgo(getMinutesAgo(item.uploadedAt))}
                        </AppText>
                      </View>
                      <View style={styles.tagPill}>
                        <AppText style={styles.tagText} numberOfLines={1}>
                          {item.selectIncident}
                        </AppText>
                      </View>
                    </View>

                    <AppText style={styles.incidentBody}>
                      {item.incidentNote}
                    </AppText>

                    <Pressable onPress={() => openIncidentEvidence(item)} hitSlop={8}>
                      <AppText style={styles.linkText}>See evidence &gt;</AppText>
                    </Pressable>

                    <View style={styles.thinDivider} />

                    <AppText style={styles.reviewCount}>
                      {item.actions.length} People have reviewed
                    </AppText>

                    <ActionRow
                      myAction={myAction}
                      onConfirm={() =>
                        handleConfirm(
                          item.electionId,
                          "incident",
                          myAction?.action === "agree"
                        )
                      }
                      onFlag={() =>
                        handleOpenFlag({
                          targetId: item.electionId,
                          dataType: "incident",
                        })
                      }
                      onUnflag={() =>
                        handleUnflag({
                          targetId: item.electionId,
                          dataType: "incident",
                        })
                      }
                      canAct={canAct}
                      onShare={() => void handleShareIncident(item)}
                    />
                  </View>
                </View>
              );
            })}
          </>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      <SeeEvidenceBottomSheet ref={evidenceRef} evidence={selectedEvidence} />
      <FlagReasonBottomSheet ref={flagRef} onSubmit={handleFlagSubmit} />
    </>
  );
}

// Action Row

function ActionRow({
  myAction,
  onConfirm,
  onFlag,
  onUnflag,
  onShare,
  canAct,
}: {
  myAction: CollationReviewAction | undefined;
  onConfirm: () => void;
  onFlag: () => void;
  onUnflag: () => void;
  onShare: () => void;
  /** False once the election has ended: show status only, no actions. */
  canAct: boolean;
}) {
  const shareButton = (
    <Pressable onPress={onShare} style={styles.shareBtn} hitSlop={6}>
      <Ionicons
        name="share-social-outline"
        size={14}
        color={Theme.colors.textMuted}
      />
      <AppText style={styles.shareText}>Share</AppText>
    </Pressable>
  );

  if (!canAct) {
    return (
      <View style={styles.actionsRow}>
        <AppText style={styles.reviewCount} numberOfLines={1}>
          {myAction?.action === "agree"
            ? "You confirmed this"
            : myAction?.action === "flag"
              ? "You flagged this"
              : "Voting has ended"}
        </AppText>
        {shareButton}
      </View>
    );
  }

  if (myAction?.action === "agree") {
    return (
      <View style={styles.actionsRow}>
        <Pressable onPress={onConfirm} style={styles.confirmedPill} hitSlop={4}>
          <Ionicons
            name="thumbs-up"
            size={14}
            color={Theme.colors.primary}
          />
          <AppText style={styles.confirmedText} numberOfLines={1}>
            You confirmed this — tap to undo
          </AppText>
        </Pressable>
        <Pressable onPress={onShare} style={styles.shareBtn} hitSlop={6}>
          <Ionicons
            name="share-social-outline"
            size={14}
            color={Theme.colors.textMuted}
          />
          <AppText style={styles.shareText}>Share</AppText>
        </Pressable>
      </View>
    );
  }

  if (myAction?.action === "flag") {
    return (
      <View style={styles.actionsRow}>
        <Pressable onPress={onUnflag} style={styles.flaggedPill} hitSlop={4}>
          <Ionicons name="flag-outline" size={14} color="#F04A1D" />
          <AppText style={styles.flaggedText} numberOfLines={1}>
            You flagged this — tap to undo
          </AppText>
        </Pressable>
        <Pressable onPress={onShare} style={styles.shareBtn} hitSlop={6}>
          <Ionicons
            name="share-social-outline"
            size={14}
            color={Theme.colors.textMuted}
          />
          <AppText style={styles.shareText}>Share</AppText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.actionsRow}>
      <View style={styles.buttonRow}>
        <Pressable onPress={onConfirm} style={styles.confirmBtn}>
          <Ionicons name="thumbs-up-outline" size={14} color={Theme.colors.primary} />
          <AppText style={styles.confirmBtnText}>Confirm</AppText>
        </Pressable>
        <Pressable onPress={onFlag} style={styles.flagBtn}>
          <Ionicons name="flag-outline" size={14} color="#F04A1D" />
          <AppText style={styles.flagBtnText}>Flag</AppText>
        </Pressable>
      </View>
      <Pressable onPress={onShare} style={styles.shareBtn} hitSlop={6}>
        <Ionicons
          name="share-social-outline"
          size={14}
          color={Theme.colors.textMuted}
        />
        <AppText style={styles.shareText}>Share</AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  section: { gap: 8, marginBottom: 18 },
  sectionTitle: {
    fontSize: 16,
    lineHeight: 22,
    color: Theme.colors.text,
    fontFamily: Theme.fonts.heading.bold,
  },
  sectionSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: Theme.colors.textMuted,
  },

  resultHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 8,
  },
  resultDotRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  redDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#EF4444",
  },
  resultLabel: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 18,
    color: Theme.colors.primary,
    fontFamily: Theme.fonts.body.semibold,
  },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  timeText: { fontSize: 11, lineHeight: 14, color: Theme.colors.textMuted },

  resultCard: {
    borderRadius: 16,
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    padding: 14,
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: { elevation: 3 },
    }),
  },
  resultElectionTitle: {
    fontSize: 14,
    lineHeight: 18,
    color: Theme.colors.text,
    fontFamily: Theme.fonts.body.semibold,
  },
  partyBlock: { gap: 5 },
  partyTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  partyLeftGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  partyName: { flexShrink: 1, fontSize: 13, lineHeight: 18, color: Theme.colors.text },
  partyPercent: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: Theme.fonts.body.semibold,
  },

  resultFooter: { paddingTop: 14, gap: 8 },
  sectionDivider: {
    height: 1,
    backgroundColor: Theme.colors.border,
    marginVertical: 18,
  },

  incidentSectionHeader: { marginBottom: 18 },
  incidentSectionTitle: {
    fontSize: 18,
    lineHeight: 24,
    color: Theme.colors.text,
    fontFamily: Theme.fonts.heading.bold,
  },
  incidentRow: { flexDirection: "row", gap: 12, marginBottom: 6 },
  incidentLeftCol: { width: 44, alignItems: "center" },
  incidentIconWrap: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  threadLine: {
    flex: 1,
    width: 2,
    backgroundColor: "#E2E8F0",
    marginTop: 4,
    borderRadius: 1,
  },
  incidentContent: { flex: 1, paddingBottom: 20, gap: 8 },
  incidentHeadRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  incidentLabel: {
    fontSize: 15,
    lineHeight: 20,
    color: Theme.colors.text,
    fontFamily: Theme.fonts.body.semibold,
  },
  incidentTime: { fontSize: 11, lineHeight: 16, color: Theme.colors.textMuted },
  tagPill: {
    maxWidth: 160,
    minHeight: 24,
    borderRadius: 999,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFEAE3",
  },
  tagText: {
    fontSize: 10,
    lineHeight: 13,
    color: "#F04A1D",
    fontFamily: Theme.fonts.body.semibold,
  },
  incidentBody: { fontSize: 14, lineHeight: 22, color: Theme.colors.text },
  thinDivider: {
    height: 1,
    backgroundColor: Theme.colors.border,
    marginVertical: 4,
  },
  linkText: {
    fontSize: 13,
    lineHeight: 18,
    color: Theme.colors.primary,
    fontFamily: Theme.fonts.body.semibold,
  },
  reviewCount: { fontSize: 13, lineHeight: 18, color: Theme.colors.textMuted },

  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingTop: 4,
  },
  buttonRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  confirmBtn: {
    minHeight: 38,
    borderRadius: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(5,163,156,0.08)",
    borderWidth: 1,
    borderColor: "rgba(5,163,156,0.2)",
  },
  confirmBtnText: {
    fontSize: 13,
    lineHeight: 18,
    color: Theme.colors.primary,
    fontFamily: Theme.fonts.body.semibold,
  },
  flagBtn: {
    minHeight: 38,
    borderRadius: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(240,74,29,0.06)",
    borderWidth: 1,
    borderColor: "rgba(240,74,29,0.2)",
  },
  flagBtnText: {
    fontSize: 13,
    lineHeight: 18,
    color: "#F04A1D",
    fontFamily: Theme.fonts.body.semibold,
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  shareText: { fontSize: 12, lineHeight: 16, color: Theme.colors.textMuted },
  confirmedPill: {
    minHeight: 36,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#E9FBF8",
  },
  confirmedText: {
    fontSize: 12,
    lineHeight: 16,
    color: Theme.colors.primary,
    fontFamily: Theme.fonts.body.semibold,
  },
  flaggedPill: {
    minHeight: 36,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFF1EC",
  },
  flaggedText: {
    fontSize: 12,
    lineHeight: 16,
    color: "#F04A1D",
    fontFamily: Theme.fonts.body.semibold,
  },

  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 10,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 20,
    lineHeight: 24,
    color: Theme.colors.text,
    fontFamily: Theme.fonts.heading.bold,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: Theme.colors.textMuted,
    textAlign: "center",
    maxWidth: 240,
  },
});
