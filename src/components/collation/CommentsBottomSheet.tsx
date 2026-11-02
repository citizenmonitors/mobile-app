import {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetModal,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import { forwardRef, useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import PulseActionSheet, {
  PulseAction,
  PulseActionSheetHandle,
} from "@/components/pulse/PulseActionSheet";
import PulseReportSheet, {
  PulseReportSheetHandle,
} from "@/components/pulse/PulseReportSheet";
import { LIKE_COLOR } from "@/components/pulse/PulseDiscussionCard";
import AppText from "@/components/ui/AppText";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import { formatTimeAgo } from "@/lib/formatTimeAgo";
import { useOfflineSync } from "@/context/OfflineSyncContext";
import { useAppToast } from "@/hooks/useAppToast";
import {
  useBlockPulseAuthorMutation,
  useCreatePulseCommentMutation,
  useDeletePulseCommentMutation,
  usePulseCommentsQuery,
  usePulseViewerQuery,
  useSetPulseCommentLikeMutation,
  useUpdatePulseCommentMutation,
} from "@/hooks/api/usePulseQueries";
import { PulseComment } from "@/lib/api/pulse.api";
import { shouldQueueAfterError } from "@/lib/offlineSubmission";
import { Theme } from "@/theme";

export type DiscussionComment = {
  id: string;
  isOwned?: boolean;
  author: string;
  body: string;
  minutesAgo: number;
  likes: number;
  shares: number;
  isLikedByCurrentUser?: boolean;
  pendingSync?: boolean;
  isEdited?: boolean;
};

type Props = {
  postId?:
    | string
    | null; /** The current user wrote the post; they may delete any comment on it. */
  postIsOwned?: boolean;
  comments?: DiscussionComment[];
  onSubmitComment?: (text: string) => void;
};

function getMinutesAgo(dateValue?: string): number {
  if (!dateValue) return 0;

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return 0;
  }

  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
}

function mapPulseComment(comment: PulseComment): DiscussionComment {
  return {
    id: comment.id,
    isOwned: comment.isOwnedByCurrentUser === true,
    author: comment.author.displayName,
    body: comment.body,
    minutesAgo: getMinutesAgo(comment.createdAt),
    isEdited: Boolean(comment.editedAt),
    likes: comment.likesCount,
    shares: 0,
    isLikedByCurrentUser: comment.isLikedByCurrentUser,
  };
}

function getViewerName(params: {
  firstName?: string;
  lastName?: string;
  anonymousUsername?: string;
  anonymous?: boolean;
}): string {
  if (params.anonymous) {
    return params.anonymousUsername || "Anonymous Citizen";
  }

  const name = [params.firstName, params.lastName].filter(Boolean).join(" ");

  return name || "@You";
}

const CommentsBottomSheet = forwardRef<BottomSheetModal, Props>(
  function CommentsBottomSheet(
    { postId: rawPostId, postIsOwned = false, comments = [], onSubmitComment },
    ref,
  ) {
    const insets = useSafeAreaInsets();

    /**
     * Two snap points:
     *  - 62% — default open position. When the keyboard appears,
     *    keyboardBehavior="interactive" lifts the whole sheet above the
     *    keyboard smoothly (Instagram/Facebook style). 62% gives the sheet
     *    enough height so the comment list is still usable after the lift.
     *  - 92% — expanded, for reading long threads.
     */
    const snapPoints = useMemo(() => ["62%", "92%"], []);
    const { handleSheetChange } = useBottomSheetBackHandler(
      ref as React.RefObject<BottomSheetModal | null>,
    );

    const postId = rawPostId ?? null;

    const { enqueue, isOnline, queue } = useOfflineSync();

    const commentsQuery = usePulseCommentsQuery(postId);
    const createCommentMutation = useCreatePulseCommentMutation();
    const likeCommentMutation = useSetPulseCommentLikeMutation();
    const updateCommentMutation = useUpdatePulseCommentMutation();
    const deleteCommentMutation = useDeletePulseCommentMutation();
    const blockMutation = useBlockPulseAuthorMutation();
    const viewerQuery = usePulseViewerQuery();
    const { showToast } = useAppToast();
    const actionsRef = useRef<PulseActionSheetHandle>(null);
    const reportRef = useRef<PulseReportSheetHandle>(null);

    const [text, setText] = useState("");
    // When set, the input edits this comment instead of adding a new one.
    const [editingId, setEditingId] = useState<string | null>(null);
    // Optimistic like state until the server answers (or while queued offline).
    const [likeOverrides, setLikeOverrides] = useState<
      Record<string, { liked: boolean; count: number }>
    >({});

    const apiComments = useMemo(() => {
      return commentsQuery.data?.comments.map(mapPulseComment) ?? [];
    }, [commentsQuery.data]);

    const pendingComments = useMemo<DiscussionComment[]>(() => {
      if (!postId) return [];

      const viewer = viewerQuery.data;

      return queue
        .filter((item) => {
          return (
            item.type === "pulse-create-comment" &&
            !item.synced &&
            item.payload.postId === postId
          );
        })
        .map((item) => {
          const body =
            typeof item.payload.body === "string" ? item.payload.body : "";

          return {
            id: item.id,
            author: getViewerName({
              firstName: viewer?.firstName,
              lastName: viewer?.lastName,
              anonymousUsername: viewer?.anonymousUsername,
              anonymous: item.payload.useAnonymousDisplay === true,
            }),
            body,
            minutesAgo: getMinutesAgo(new Date(item.createdAt).toISOString()),
            likes: 0,
            shares: 0,
            pendingSync: true,
          };
        })
        .filter((item) => item.body.trim().length > 0)
        .reverse();
    }, [postId, queue, viewerQuery.data]);

    const resolvedComments = useMemo(() => {
      if (!postId) return comments;

      return [...pendingComments, ...apiComments];
    }, [apiComments, comments, pendingComments, postId]);

    const close = useCallback(() => {
      Keyboard.dismiss();

      if (ref && typeof ref !== "function" && ref.current) {
        ref.current.dismiss();
      }
    }, [ref]);

    const cancelEdit = useCallback(() => {
      setEditingId(null);
      setText("");
    }, []);

    const submit = useCallback(async () => {
      const trimmed = text.trim();

      if (!trimmed) return;

      if (editingId && postId) {
        try {
          await updateCommentMutation.mutateAsync({
            postId,
            commentId: editingId,
            body: trimmed,
          });
          cancelEdit();
        } catch (error) {
          showToast({
            type: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unable to edit comment.",
          });
        }
        return;
      }

      if (!postId) {
        onSubmitComment?.(trimmed);
        setText("");
        return;
      }

      const queuedPayload = {
        postId,
        body: trimmed,
        useAnonymousDisplay: false,
      };

      if (!isOnline) {
        enqueue({
          type: "pulse-create-comment",
          payload: queuedPayload,
        });

        setText("");
        return;
      }

      try {
        await createCommentMutation.mutateAsync({
          postId,
          payload: {
            body: trimmed,
            useAnonymousDisplay: false,
          },
        });

        setText("");
        await commentsQuery.refetch();
      } catch (error) {
        if (shouldQueueAfterError(error)) {
          enqueue({
            type: "pulse-create-comment",
            payload: queuedPayload,
          });

          setText("");
          return;
        }

        console.log("Pulse comment submit error:", error);
      }
    }, [
      cancelEdit,
      commentsQuery,
      createCommentMutation,
      editingId,
      enqueue,
      isOnline,
      onSubmitComment,
      postId,
      showToast,
      text,
      updateCommentMutation,
    ]);

    const toggleLike = useCallback(
      async (comment: DiscussionComment) => {
        if (!postId || comment.pendingSync) return;

        const current = likeOverrides[comment.id] ?? {
          liked: comment.isLikedByCurrentUser === true,
          count: comment.likes,
        };
        const like = !current.liked;

        setLikeOverrides((prev) => ({
          ...prev,
          [comment.id]: {
            liked: like,
            count: Math.max(0, current.count + (like ? 1 : -1)),
          },
        }));

        const clearOverride = () =>
          setLikeOverrides((prev) => {
            const next = { ...prev };
            delete next[comment.id];
            return next;
          });

        const queuedPayload = { postId, commentId: comment.id, liked: like };

        if (!isOnline) {
          enqueue({ type: "pulse-like-comment", payload: queuedPayload });
          return;
        }

        try {
          // POST likes, DELETE unlikes; the list refetches with server values.
          await likeCommentMutation.mutateAsync({
            postId,
            commentId: comment.id,
            like,
          });
          clearOverride();
        } catch (error) {
          if (shouldQueueAfterError(error)) {
            enqueue({ type: "pulse-like-comment", payload: queuedPayload });
            return;
          }

          clearOverride();
          console.log("Pulse comment like error:", error);
        }
      },
      [enqueue, isOnline, likeCommentMutation, likeOverrides, postId],
    );

    const openCommentActions = useCallback(
      (comment: DiscussionComment) => {
        if (!postId || comment.pendingSync) return;

        const deleteComment = () =>
          Alert.alert("Delete comment?", "This can't be undone.", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: () => {
                deleteCommentMutation
                  .mutateAsync({ postId, commentId: comment.id })
                  .catch((error: unknown) =>
                    showToast({
                      type: "error",
                      message:
                        error instanceof Error
                          ? error.message
                          : "Unable to delete comment.",
                    }),
                  );
              },
            },
          ]);

        const blockAuthor = () =>
          Alert.alert(
            `Block ${comment.author}?`,
            "You won't see each other's posts or comments. You can unblock them from your profile.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Block",
                style: "destructive",
                onPress: () => {
                  blockMutation
                    .mutateAsync({ commentId: comment.id })
                    .then(() =>
                      showToast({
                        type: "success",
                        message: `${comment.author} is blocked.`,
                      }),
                    )
                    .catch((error: unknown) =>
                      showToast({
                        type: "error",
                        message:
                          error instanceof Error
                            ? error.message
                            : "Unable to block.",
                      }),
                    );
                },
              },
            ],
          );

        const actions: PulseAction[] = [];

        if (comment.isOwned) {
          actions.push({
            icon: "create-outline",
            label: "Edit comment",
            onPress: () => {
              setEditingId(comment.id);
              setText(comment.body);
            },
          });
        }

        // The post's author may delete any comment on their post.
        if (comment.isOwned || postIsOwned) {
          actions.push({
            icon: "trash-outline",
            label: "Delete comment",
            danger: true,
            onPress: deleteComment,
          });
        }

        if (!comment.isOwned) {
          actions.push(
            {
              icon: "flag-outline",
              label: "Report comment",
              danger: true,
              onPress: () =>
                reportRef.current?.present({
                  postId,
                  commentId: comment.id,
                  authorName: comment.author,
                }),
            },
            {
              icon: "ban-outline",
              label: `Block ${comment.author}`,
              danger: true,
              onPress: blockAuthor,
            },
          );
        }

        actionsRef.current?.present(actions);
      },
      [blockMutation, deleteCommentMutation, postId, postIsOwned, showToast],
    );

    const canSend =
      text.trim().length > 0 &&
      !createCommentMutation.isPending &&
      !updateCommentMutation.isPending;

    return (
      <>
        <BottomSheetModal
          ref={ref}
          snapPoints={snapPoints}
          index={1}
          enablePanDownToClose
          enableDynamicSizing={false}
          topInset={insets.top + 12}
          /**
           * "interactive" — the sheet slides up to sit just above the keyboard
           * on both iOS and Android physical devices. This is the correct mode
           * for any sheet with a pinned bottom input (comments, chat, etc.).
           *
           * Do NOT use "extend" + here:
           * adjustResize is deprecated on Android 11+ edge-to-edge layouts and
           * fails silently on physical devices, leaving the input buried under
           * the keyboard.
           */
          keyboardBehavior="interactive"
          keyboardBlurBehavior="restore"
          onChange={handleSheetChange}
          backdropComponent={(props) => (
            <BottomSheetBackdrop
              {...props}
              appearsOnIndex={0}
              disappearsOnIndex={-1}
              opacity={0.3}
              pressBehavior="close"
            />
          )}
          handleIndicatorStyle={styles.handle}
          backgroundStyle={styles.bg}
        >
          <View style={styles.sheetBody}>
            <View style={styles.header}>
              <View style={styles.headerTextWrap}>
                <AppText style={styles.headerTitle}>Comments</AppText>

                {postId && !isOnline ? (
                  <AppText style={styles.headerSubtitle}>
                    Offline comments will sync automatically
                  </AppText>
                ) : null}
              </View>

              <Pressable onPress={close} hitSlop={8} style={styles.closeBtn}>
                <Ionicons
                  name="close"
                  size={22}
                  color={Theme.colors.textMuted}
                />
              </Pressable>
            </View>

            <BottomSheetFlatList
              style={styles.list}
              data={resolvedComments}
              keyExtractor={(comment) => comment.id}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={
                Platform.OS === "ios" ? "interactive" : "on-drag"
              }
              refreshing={commentsQuery.isRefetching}
              onRefresh={() => {
                if (postId) {
                  void commentsQuery.refetch();
                }
              }}
              contentContainerStyle={[
                styles.listContent,
                resolvedComments.length === 0 && styles.listContentEmpty,
              ]}
              ListEmptyComponent={
                commentsQuery.isLoading ? null : (
                  <View style={styles.emptyWrap}>
                    <Ionicons
                      name="chatbubbles-outline"
                      size={32}
                      color={Theme.colors.textMuted}
                    />
                    <AppText style={styles.emptyTitle}>No comments yet</AppText>
                    <AppText style={styles.emptyText}>
                      Be the first to respond to this pulse update.
                    </AppText>
                  </View>
                )
              }
              renderItem={({ item }) => {
                const override = likeOverrides[item.id];
                const isLiked =
                  override?.liked ?? item.isLikedByCurrentUser === true;
                const displayLikes = override?.count ?? item.likes;
                const canManage = !item.pendingSync && Boolean(postId);

                return (
                  <View style={styles.commentCard}>
                    <View style={styles.commentHead}>
                      <View style={styles.commentAuthorRow}>
                        <Ionicons
                          name={
                            item.pendingSync
                              ? "cloud-upload-outline"
                              : "chatbox-ellipses-outline"
                          }
                          size={14}
                          color={Theme.colors.textMuted}
                        />

                        <AppText style={styles.commentAuthor}>
                          {item.author}
                        </AppText>
                      </View>

                      <View style={styles.commentHeadRight}>
                        <AppText style={styles.commentTime}>
                          {item.pendingSync
                            ? "Pending sync"
                            : `${formatTimeAgo(item.minutesAgo)}${item.isEdited ? " · Edited" : ""}`}
                        </AppText>

                        {canManage ? (
                          <Pressable
                            onPress={() => openCommentActions(item)}
                            hitSlop={10}
                            accessibilityLabel="Comment options"
                          >
                            <Ionicons
                              name="ellipsis-horizontal"
                              size={16}
                              color={Theme.colors.textSoft}
                            />
                          </Pressable>
                        ) : null}
                      </View>
                    </View>

                    <AppText style={styles.commentBody}>{item.body}</AppText>

                    <View style={styles.commentActions}>
                      <Pressable
                        onPress={() => {
                          void toggleLike(item);
                        }}
                        style={styles.likeBtn}
                        hitSlop={6}
                        disabled={item.pendingSync}
                      >
                        <Ionicons
                          name={isLiked ? "heart" : "heart-outline"}
                          size={16}
                          color={isLiked ? LIKE_COLOR : Theme.colors.textMuted}
                        />

                        <AppText
                          style={[
                            styles.likeText,
                            isLiked && { color: LIKE_COLOR },
                          ]}
                        >
                          {displayLikes} Likes
                        </AppText>
                      </Pressable>
                    </View>
                  </View>
                );
              }}
            />

            <View
              style={[
                styles.inputContainer,
                // With keyboardBehavior="interactive" the sheet sits above the
                // keyboard, so just use safe-area insets for the bottom gap.
                { paddingBottom: Math.max(insets.bottom, 8) },
              ]}
            >
              {editingId ? (
                <View style={styles.editingBar}>
                  <AppText style={styles.editingText}>Editing comment</AppText>
                  <Pressable onPress={cancelEdit} hitSlop={8}>
                    <AppText style={styles.editingCancel}>Cancel</AppText>
                  </Pressable>
                </View>
              ) : null}

              <View style={styles.inputRow}>
                <View style={styles.inputIconWrap}>
                  <Ionicons
                    name="chatbubbles-outline"
                    size={20}
                    color={Theme.colors.textMuted}
                  />
                </View>

                <View style={styles.inputFieldWrap}>
                  <BottomSheetTextInput
                    placeholder="Leave Comment, @ To Mention"
                    placeholderTextColor={Theme.colors.textSoft}
                    value={text}
                    onChangeText={setText}
                    style={styles.input}
                    returnKeyType="send"
                    onSubmitEditing={() => {
                      void submit();
                    }}
                    multiline
                  />
                </View>
              </View>

              <Pressable
                onPress={() => {
                  void submit();
                }}
                disabled={!canSend}
                style={[styles.submitBtn, !canSend && styles.submitBtnDisabled]}
              >
                <AppText
                  style={[
                    styles.submitBtnText,
                    !canSend && styles.submitBtnTextDisabled,
                  ]}
                >
                  {isOnline ? "Submit Comment" : "Save Offline"}
                </AppText>
              </Pressable>
            </View>
          </View>
        </BottomSheetModal>
        <PulseActionSheet ref={actionsRef} />
        <PulseReportSheet ref={reportRef} />
      </>
    );
  },
);

export default CommentsBottomSheet;

const styles = StyleSheet.create({
  bg: {
    backgroundColor: Theme.colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },

  handle: {
    backgroundColor: "rgba(17,26,50,0.12)",
    width: 44,
  },

  sheetBody: {
    flex: 1,
  },

  header: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.border,
  },

  headerTextWrap: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },

  headerTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: Theme.fonts.heading.semibold,
    color: Theme.colors.text,
  },

  headerSubtitle: {
    fontSize: 11.5,
    lineHeight: 16,
    color: Theme.colors.textMuted,
  },

  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.74)",
    alignItems: "center",
    justifyContent: "center",
  },

  list: {
    flex: 1,
  },

  listContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 20,
  },

  listContentEmpty: {
    flexGrow: 1,
    justifyContent: "center",
  },

  commentCard: {
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.border,
    paddingBottom: 14,
    marginBottom: 14,
    gap: 6,
  },

  commentHeadRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  editingBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 8,
  },
  editingText: {
    fontSize: 12,
    color: Theme.colors.textMuted,
    fontFamily: Theme.fonts.body.medium,
  },
  editingCancel: {
    fontSize: 12,
    color: Theme.colors.primary,
    fontFamily: Theme.fonts.body.semibold,
  },
  commentHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  commentAuthorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  commentAuthor: {
    fontSize: 14,
    lineHeight: 18,
    color: Theme.colors.text,
    fontFamily: Theme.fonts.body.semibold,
  },

  commentTime: {
    fontSize: 11,
    lineHeight: 14,
    color: Theme.colors.textMuted,
  },

  commentBody: {
    fontSize: 14,
    lineHeight: 22,
    color: Theme.colors.text,
  },

  commentActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingTop: 2,
  },

  likeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  likeText: {
    fontSize: 12,
    lineHeight: 16,
    color: Theme.colors.textMuted,
  },

  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    gap: 8,
  },

  emptyTitle: {
    fontSize: 16,
    lineHeight: 22,
    color: Theme.colors.text,
    fontFamily: Theme.fonts.body.semibold,
  },

  emptyText: {
    fontSize: 13,
    lineHeight: 18,
    color: Theme.colors.textMuted,
    textAlign: "center",
    maxWidth: 240,
  },

  inputContainer: {
    backgroundColor: Theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: Theme.colors.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },

  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },

  inputIconWrap: {
    width: 36,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },

  inputFieldWrap: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },

  input: {
    minHeight: 22,
    maxHeight: 100,
    fontSize: 14,
    lineHeight: 20,
    color: Theme.colors.text,
    fontFamily: Theme.fonts.body.regular,
    padding: 0,
    textAlignVertical: "top",
  },

  submitBtn: {
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: Theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  submitBtnDisabled: {
    backgroundColor: "#D1D5DB",
  },

  submitBtnText: {
    fontSize: 14,
    lineHeight: 20,
    color: Theme.colors.white,
    fontFamily: Theme.fonts.body.semibold,
  },

  submitBtnTextDisabled: {
    color: "#9CA3AF",
  },
});
