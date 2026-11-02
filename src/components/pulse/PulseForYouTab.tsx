import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { router } from "expo-router";
import {
  Alert,
  FlatList,
  ListRenderItemInfo,
  RefreshControl,
  Share,
  StyleSheet,
  View,
} from "react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import * as Clipboard from "expo-clipboard";

import AppButton from "@/components/ui/AppButton";
import AppText from "@/components/ui/AppText";
import CommentsBottomSheet from "@/components/collation/CommentsBottomSheet";
import PulseDiscussionCard from "@/components/pulse/PulseDiscussionCard";
import PulseEditPostSheet, {
  PulseEditPostSheetHandle,
} from "@/components/pulse/PulseEditPostSheet";
import PulseActionSheet, {
  PulseAction,
  PulseActionSheetHandle,
} from "@/components/pulse/PulseActionSheet";
import PulseReportSheet, {
  PulseReportSheetHandle,
} from "@/components/pulse/PulseReportSheet";
import PulseScopeFilter from "@/components/pulse/PulseScopeFilter";
import PulseWelcomeCard from "@/components/pulse/PulseWelcomeCard";
import { Paths } from "@/constants/paths";
import { PulseDiscussionPost } from "@/data/pulse";
import { useAppToast } from "@/hooks/useAppToast";
import { useOfflineSync } from "@/context/OfflineSyncContext";
import {
  useBlockPulseAuthorMutation,
  useDeletePulsePostMutation,
  usePulsePostQuery,
  usePulsePostsInfiniteQuery,
  usePulseViewerQuery,
  useRepostPulsePostMutation,
  useSetPulsePostLikeMutation,
  useUndoRepostPulsePostMutation,
} from "@/hooks/api/usePulseQueries";
import {
  getPulsePostUrl,
  PulseFeedScope,
  PulsePost,
  PulseVisibilityScope,
} from "@/lib/api/pulse.api";
import { shouldQueueAfterError } from "@/lib/offlineSubmission";
import { Theme } from "@/theme";
import NoDiscussion from "@/svgs/app/collation/NoDiscussion";

type PulseFeedItem = PulseDiscussionPost & {
  apiPostId: string;
  isLikedByCurrentUser: boolean;
  visibilityScope: PulseVisibilityScope;
  pendingSync?: boolean;
};

type LikeOverride = { liked: boolean; count: number };

function getEmptySubtitle(scope: PulseFeedScope): string {
  switch (scope) {
    case "state":
      return "You will see discussions in your state here.";
    case "lga":
      return "You will see discussions in your LGA here.";
    case "ward":
      return "You will see discussions in your ward here.";
    case "polling-unit":
      return "You will see discussions in your polling unit here.";
    case "all":
    default:
      return "Discussions from across the country will show up here.";
  }
}

function mapPostToFeedItem(post: PulsePost): PulseFeedItem {
  const original = post.isRepost ? post.originalPost : null;
  const isQuote = Boolean(post.isRepost && post.isQuote);
  // Plain reposts show the original's author and content, with a
  // "reposted" line. Quotes show the quoter's own content.
  const isPlainRepost = Boolean(original) && !isQuote;
  const shown =
    isPlainRepost && original && !original.unavailable ? original : null;

  return {
    id: post.id,
    apiPostId: post.id,
    author: shown?.author?.displayName ?? post.author.displayName,
    avatarUri:
      (shown ? shown.author?.avatarUrl : post.author.avatarUrl) ?? undefined,
    isOwned: post.isOwnedByCurrentUser === true,
    visibilityScope: post.visibilityScope,
    body: shown ? (shown.body ?? "") : isPlainRepost ? "" : post.body,
    imageUri:
      (shown ? shown.imageUrl : isPlainRepost ? null : post.imageUrl) ??
      undefined,
    createdAt: shown?.createdAt ?? post.createdAt,
    likes: post.likesCount,
    commentCount: post.commentsCount,
    repostCount: (post.repostCount ?? 0) + (post.quoteCount ?? 0),
    isRepost: isPlainRepost,
    isQuote,
    originalPostId: original?.id,
    repostedBy: isPlainRepost ? post.author.displayName : undefined,
    originalUnavailable: isPlainRepost && original?.unavailable === true,
    quoted:
      isQuote && original
        ? {
            id: original.id,
            unavailable: original.unavailable === true,
            author: original.author?.displayName,
            avatarUri: original.author?.avatarUrl ?? undefined,
            body: original.body,
            imageUri: original.imageUrl ?? undefined,
            createdAt: original.createdAt,
          }
        : undefined,
    isRepostedByMe: post.isRepostedByCurrentUser === true,
    originalIsOwned: original?.isOwnedByCurrentUser === true,
    // Plain reposts show the original, whose edit state isn't sent.
    isEdited: !isPlainRepost && Boolean(post.editedAt),
    isLikedByCurrentUser: post.isLikedByCurrentUser,
  };
}

/**
 * The post that reposts, links and blocks act on: the original on plain
 * repost cards; the card's own post otherwise (quotes target themselves).
 */
function getContentPostId(post: PulseFeedItem): string {
  return post.isRepost && post.originalPostId
    ? post.originalPostId
    : post.apiPostId;
}

function getQueuedPostAuthor(params: {
  useAnonymousDisplay: boolean;
  anonymousUsername?: string;
  firstName?: string;
  lastName?: string;
}): string {
  if (params.useAnonymousDisplay) {
    return params.anonymousUsername
      ? `@${params.anonymousUsername}`
      : "Anonymous Citizen";
  }

  const name = [params.firstName, params.lastName].filter(Boolean).join(" ");

  return name || "You";
}

function PulseSkeletonBlock({ style }: { style?: object }) {
  return <View style={[styles.skeletonBlock, style]} />;
}

function PulsePostSkeleton() {
  return (
    <View style={styles.skeletonPostCard}>
      <View style={styles.skeletonAuthorRow}>
        <PulseSkeletonBlock style={styles.skeletonAvatar} />

        <View style={styles.skeletonAuthorTextWrap}>
          <PulseSkeletonBlock style={styles.skeletonAuthorName} />
          <PulseSkeletonBlock style={styles.skeletonPostMeta} />
        </View>

        <PulseSkeletonBlock style={styles.skeletonTime} />
      </View>

      <PulseSkeletonBlock style={styles.skeletonBodyOne} />
      <PulseSkeletonBlock style={styles.skeletonBodyTwo} />
      <PulseSkeletonBlock style={styles.skeletonImage} />

      <View style={styles.skeletonActionsRow}>
        <PulseSkeletonBlock style={styles.skeletonAction} />
        <PulseSkeletonBlock style={styles.skeletonAction} />
        <PulseSkeletonBlock style={styles.skeletonAction} />
      </View>
    </View>
  );
}

function PulseFeedSkeleton() {
  return (
    <View>
      <PulsePostSkeleton />
      <PulsePostSkeleton />
      <PulsePostSkeleton />
      <View style={{ height: 120 }} />
    </View>
  );
}

type Props = {
  /** Show just this one post (shared link, tapped quote, notification). */
  postId?: string;
};

export default function PulseForYouTab({ postId }: Props) {
  const isSinglePost = Boolean(postId);
  const { showToast } = useAppToast();
  const { enqueue, isOnline, queue } = useOfflineSync();

  const commentsRef = useRef<BottomSheetModal>(null);
  const optionsRef = useRef<PulseActionSheetHandle>(null);
  const reportRef = useRef<PulseReportSheetHandle>(null);
  const editRef = useRef<PulseEditPostSheetHandle>(null);

  const [scope, setScope] = useState<PulseFeedScope>("all");
  const feedQuery = usePulsePostsInfiniteQuery(scope, {
    enabled: !isSinglePost,
  });
  const singlePostQuery = usePulsePostQuery(postId ?? null);
  // One shape for both modes; a single post has no further pages.
  const postsQuery = useMemo(
    () =>
      isSinglePost
        ? {
            data: singlePostQuery.data,
            isLoading: singlePostQuery.isLoading,
            isRefetching: singlePostQuery.isRefetching,
            isError: singlePostQuery.isError,
            error: singlePostQuery.error,
            refetch: singlePostQuery.refetch,
            hasNextPage: false,
            isFetchingNextPage: false,
            fetchNextPage: async () => undefined,
          }
        : feedQuery,
    [feedQuery, isSinglePost, singlePostQuery],
  );
  const viewerQuery = usePulseViewerQuery();
  const likeMutation = useSetPulsePostLikeMutation();
  const repostMutation = useRepostPulsePostMutation();
  const undoRepostMutation = useUndoRepostPulsePostMutation();
  const deleteMutation = useDeletePulsePostMutation();
  const blockMutation = useBlockPulseAuthorMutation();

  const [commentsPost, setCommentsPost] = useState<{
    id: string;
    isOwned: boolean;
  } | null>(null);
  // Optimistic like state until the server answers (or while queued offline).
  const [likeOverrides, setLikeOverrides] = useState<
    Record<string, LikeOverride>
  >({});
  // Optimistic repost state until the feed refreshes, keyed by the post
  // being reposted.
  const [repostOverrides, setRepostOverrides] = useState<
    Record<string, boolean>
  >({});

  const apiPosts = useMemo(
    () =>
      postsQuery.data?.pages.flatMap((page) =>
        page.posts.map(mapPostToFeedItem),
      ) ?? [],
    [postsQuery.data],
  );

  const pendingPosts = useMemo<PulseFeedItem[]>(() => {
    const viewer = viewerQuery.data;

    return queue
      .filter((item) => item.type === "pulse-create-post" && !item.synced)
      .map((item) => {
        const body =
          typeof item.payload.body === "string" ? item.payload.body : "";
        const imageUri =
          typeof item.payload.imageUri === "string"
            ? item.payload.imageUri
            : undefined;

        return {
          id: item.id,
          apiPostId: item.id,
          isOwned: true,
          author: getQueuedPostAuthor({
            useAnonymousDisplay: item.payload.useAnonymousDisplay === true,
            anonymousUsername: viewer?.anonymousUsername,
            firstName: viewer?.firstName,
            lastName: viewer?.lastName,
          }),
          visibilityScope: "all" as const,
          body,
          imageUri,
          createdAt: new Date(item.createdAt).toISOString(),
          likes: 0,
          commentCount: 0,
          repostCount: 0,
          isRepost: false,
          isQuote: false,
          isRepostedByMe: false,
          isLikedByCurrentUser: false,
          pendingSync: true,
        };
      })
      .reverse();
  }, [queue, viewerQuery.data]);

  const posts = useMemo(
    () => (isSinglePost ? apiPosts : [...pendingPosts, ...apiPosts]),
    [apiPosts, isSinglePost, pendingPosts],
  );

  const hasPosts = posts.length > 0;

  const isInitialLoading =
    postsQuery.isLoading &&
    !postsQuery.data &&
    (isSinglePost || pendingPosts.length === 0);

  const isRefreshing = postsQuery.isRefetching;

  const onRefresh = useCallback(() => {
    setRepostOverrides({});
    void postsQuery.refetch();
  }, [postsQuery]);

  const handleLike = useCallback(
    async (post: PulseFeedItem) => {
      if (post.pendingSync) {
        showToast({
          type: "error",
          message: "This post will be available after it syncs.",
        });
        return;
      }

      const id = post.apiPostId;
      const current = likeOverrides[id] ?? {
        liked: post.isLikedByCurrentUser,
        count: post.likes,
      };
      const like = !current.liked;

      setLikeOverrides((prev) => ({
        ...prev,
        [id]: {
          liked: like,
          count: Math.max(0, current.count + (like ? 1 : -1)),
        },
      }));

      const clearOverride = () =>
        setLikeOverrides((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });

      if (!isOnline) {
        enqueue({
          type: "pulse-like-post",
          payload: { postId: id, liked: like },
        });
        return;
      }

      try {
        // POST likes, DELETE unlikes; the cache is updated from the response.
        await likeMutation.mutateAsync({ postId: id, like });
        clearOverride();
      } catch (error) {
        if (shouldQueueAfterError(error)) {
          enqueue({
            type: "pulse-like-post",
            payload: { postId: id, liked: like },
          });
          return;
        }

        clearOverride();
        showToast({
          type: "error",
          message:
            error instanceof Error ? error.message : "Unable to like post.",
        });
      }
    },
    [enqueue, isOnline, likeMutation, likeOverrides, showToast],
  );

  const isRepostedByMe = useCallback(
    (post: PulseFeedItem) => {
      return repostOverrides[getContentPostId(post)] ?? post.isRepostedByMe;
    },
    [repostOverrides],
  );

  const toggleRepost = useCallback(
    async (post: PulseFeedItem) => {
      if (post.pendingSync) return;

      if (!isOnline) {
        showToast({
          type: "error",
          message: "You're offline. Try again when connected.",
        });
        return;
      }

      const originalId = getContentPostId(post);
      const undo = isRepostedByMe(post);

      setRepostOverrides((prev) => ({ ...prev, [originalId]: !undo }));

      try {
        if (undo) {
          await undoRepostMutation.mutateAsync(originalId);
          showToast({ type: "success", message: "Repost removed." });
        } else {
          await repostMutation.mutateAsync(originalId);
          showToast({ type: "success", message: "Reposted." });
        }
      } catch (error) {
        setRepostOverrides((prev) => ({ ...prev, [originalId]: undo }));
        showToast({
          type: "error",
          message: error instanceof Error ? error.message : "Unable to repost.",
        });
      }
    },
    [isOnline, isRepostedByMe, repostMutation, showToast, undoRepostMutation],
  );

  // Opens the repost screen: the post is shown with an optional comment box.
  // No comment = plain repost; a comment = repost with comment (quote).
  const openRepost = useCallback((post: PulseFeedItem) => {
    router.push({
      pathname: "/(app)/pulse-compose",
      params: {
        quoteId: getContentPostId(post),
        quoteAuthor: post.author,
        quoteBody: post.body.slice(0, 400),
        quoteImage: post.imageUri ?? "",
        quoteDate: post.createdAt,
      },
    });
  }, []);

  const handleRepost = useCallback(
    (post: PulseFeedItem) => {
      if (post.pendingSync || post.originalUnavailable) return;

      if (!isRepostedByMe(post)) {
        openRepost(post);
        return;
      }

      // Already reposted: offer to undo it, or repost again with a comment.
      optionsRef.current?.present([
        {
          icon: "repeat",
          label: "Undo repost",
          danger: true,
          onPress: () => void toggleRepost(post),
        },
        {
          icon: "create-outline",
          label: "Repost with comment",
          onPress: () => openRepost(post),
        },
      ]);
    },
    [isRepostedByMe, openRepost, toggleRepost],
  );

  const handleShare = useCallback(
    async (post: PulseFeedItem) => {
      try {
        const url = getPulsePostUrl(getContentPostId(post));
        await Share.share({ message: `${post.body}\n\n${url}`, url });
      } catch {
        showToast({ type: "error", message: "Unable to share." });
      }
    },
    [showToast],
  );

  const handleOpenComments = useCallback(
    (post: PulseFeedItem) => {
      if (post.pendingSync) {
        showToast({
          type: "error",
          message: "Comments will be available after this post syncs.",
        });
        return;
      } // Comments belong to this exact post (a repost has its own), and that
      // post's author may delete any of them.
      setCommentsPost({ id: post.apiPostId, isOwned: post.isOwned });
      requestAnimationFrame(() => commentsRef.current?.present());
    },
    [showToast],
  );

  const handleEdit = useCallback((post: PulseFeedItem) => {
    editRef.current?.present({
      id: post.apiPostId,
      body: post.body,
      imageUri: post.imageUri,
      visibilityScope: post.visibilityScope,
    });
  }, []);

  const handleDelete = useCallback(
    (post: PulseFeedItem) => {
      const run = async () => {
        try {
          if (post.isRepost) {
            await undoRepostMutation.mutateAsync(post.apiPostId);
            setRepostOverrides((prev) => ({
              ...prev,
              [getContentPostId(post)]: false,
            }));
            showToast({ type: "success", message: "Repost removed." });
          } else {
            await deleteMutation.mutateAsync(post.apiPostId);
            showToast({ type: "success", message: "Post deleted." });
          }
        } catch (error) {
          showToast({
            type: "error",
            message:
              error instanceof Error ? error.message : "Something went wrong.",
          });
        }
      };

      if (post.isRepost) {
        void run();
        return;
      }

      Alert.alert(
        "Delete post?",
        "This can't be undone. Reposts of this post and all comments will be deleted too.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: () => void run() },
        ],
      );
    },
    [deleteMutation, showToast, undoRepostMutation],
  );

  const handleBlock = useCallback(
    (post: PulseFeedItem) => {
      Alert.alert(
        `Block ${post.author}?`,
        "You won't see each other's posts or comments, and neither of you can interact with the other's content. You can unblock them from your profile.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Block",
            style: "destructive",
            onPress: () => {
              // Blocks are made from content; on reposts, block the original author.
              blockMutation
                .mutateAsync({ postId: getContentPostId(post) })
                .then(() =>
                  showToast({
                    type: "success",
                    message: `${post.author} is blocked.`,
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
    },
    [blockMutation, showToast],
  );

  const handleOpenOptions = useCallback(
    (post: PulseFeedItem) => {
      const actions: PulseAction[] = [];

      if (post.isOwned && !post.isRepost) {
        actions.push({
          icon: "create-outline",
          label: "Edit post",
          onPress: () => handleEdit(post),
        });
      }

      actions.push(
        {
          icon: "copy-outline",
          label: "Copy post text",
          onPress: () => {
            void Clipboard.setStringAsync(post.body).then(() =>
              showToast({ type: "success", message: "Post text copied." }),
            );
          },
        },
        {
          icon: "link-outline",
          label: "Copy link",
          onPress: () => {
            void Clipboard.setStringAsync(
              getPulsePostUrl(getContentPostId(post)),
            ).then(() =>
              showToast({ type: "success", message: "Link copied." }),
            );
          },
        },
        {
          icon: "share-social-outline",
          label: "Share post",
          onPress: () => void handleShare(post),
        },
      );

      if (post.isOwned) {
        actions.push({
          icon: post.isRepost ? "repeat" : "trash-outline",
          label: post.isRepost ? "Undo repost" : "Delete post",
          danger: true,
          onPress: () => handleDelete(post),
        });
      }

      // Report/Block only on someone else's content. A plain repost card
      // shows its original, so ownership comes from the original there.
      const isOthersContent = post.isRepost
        ? !post.originalIsOwned
        : !post.isOwned;
      if (isOthersContent) {
        actions.push(
          {
            icon: "flag-outline",
            label: "Report post",
            danger: true,
            onPress: () =>
              reportRef.current?.present({
                postId: post.apiPostId,
                // Reporting a plain repost reports (and hides) its original.
                originalPostId: post.isRepost ? post.originalPostId : undefined,
                authorName: post.author,
              }),
          },
          {
            icon: "ban-outline",
            label: `Block ${post.author}`,
            danger: true,
            onPress: () => handleBlock(post),
          },
        );
      }

      optionsRef.current?.present(actions);
    },
    [handleBlock, handleDelete, handleEdit, handleShare, showToast],
  );

  const handleEndReached = useCallback(() => {
    if (postsQuery.hasNextPage && !postsQuery.isFetchingNextPage) {
      void postsQuery.fetchNextPage();
    }
  }, [postsQuery]);

  // The founder's intro post is always pinned first on the "All" feed.
  // Memoized so FlatList doesn't remount it on every render.
  const headerElement = useMemo(
    () => (scope === "all" && !isSinglePost ? <PulseWelcomeCard /> : null),
    [isSinglePost, scope],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<PulseFeedItem>) => {
      const override = likeOverrides[item.apiPostId];

      return (
        <PulseDiscussionCard
          post={item}
          isLiked={override?.liked ?? item.isLikedByCurrentUser}
          displayLikes={override?.count ?? item.likes}
          isReposted={isRepostedByMe(item)}
          // Users can repost their own posts too (like X). Only posts still
          // waiting to sync offline can't be reposted yet.
          canRepost={!item.pendingSync}
          repostedByMe={item.isRepost && item.isOwned}
          onOpenQuoted={(id) => router.push(Paths.appPulsePost(id))}
          pendingSync={item.pendingSync}
          onMore={() => handleOpenOptions(item)}
          onLike={() => {
            void handleLike(item);
          }}
          onComment={() => handleOpenComments(item)}
          onRepost={() => {
            void handleRepost(item);
          }}
          onShare={() => {
            void handleShare(item);
          }}
        />
      );
    },
    [
      handleLike,
      handleOpenComments,
      handleOpenOptions,
      handleRepost,
      handleShare,
      isRepostedByMe,
      likeOverrides,
    ],
  );

  // A filtered feed returns 400 (e.g. "Complete your LGA in your profile
  // first") when that part of the user's profile is empty.
  const errorMessage =
    postsQuery.isError && !hasPosts
      ? postsQuery.error instanceof Error
        ? postsQuery.error.message
        : "Unable to load posts."
      : null;

  const emptyState = isInitialLoading ? (
    <PulseFeedSkeleton />
  ) : isSinglePost ? (
    // 404: deleted, or hidden for this user (blocked author / reported).
    <View style={styles.emptyWrap}>
      <NoDiscussion width={110} height={110} />
      <AppText style={styles.emptyTitle}>Post unavailable</AppText>
      <AppText style={styles.emptySubtitle}>
        This post was deleted or isn&apos;t available to you.
      </AppText>
    </View>
  ) : errorMessage ? (
    <View style={styles.emptyWrap}>
      <NoDiscussion width={110} height={110} />
      <AppText style={styles.emptySubtitle}>{errorMessage}</AppText>
      {scope !== "all" ? (
        <AppButton
          title="Update my profile"
          onPress={() => router.push(Paths.appMe)}
          style={styles.errorButton}
        />
      ) : (
        <AppButton
          title="Try again"
          variant="secondary"
          onPress={() => void postsQuery.refetch()}
          style={styles.errorButton}
        />
      )}
    </View>
  ) : (
    <View style={styles.emptyWrap}>
      <NoDiscussion width={110} height={110} />
      <AppText style={styles.emptyTitle}>No Discussion yet</AppText>
      <AppText style={styles.emptySubtitle}>{getEmptySubtitle(scope)}</AppText>
    </View>
  );

  // The list stays mounted while a filter loads (skeleton shows as its empty
  // state) so the composer above it keeps any half-written post.
  return (
    <>
      {isSinglePost ? null : (
        <PulseScopeFilter value={scope} onChange={setScope} />
      )}

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={headerElement}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.4}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={9}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={Theme.colors.primary}
            colors={[Theme.colors.primary]}
          />
        }
        contentContainerStyle={[
          styles.listContent,
          !hasPosts && !isInitialLoading && styles.listContentEmpty,
        ]}
        ListEmptyComponent={emptyState}
        ListFooterComponent={
          <>
            {postsQuery.isFetchingNextPage ? <PulsePostSkeleton /> : null}
            <View style={{ height: 120 }} />
          </>
        }
      />

      <CommentsBottomSheet
        ref={commentsRef}
        postId={commentsPost?.id ?? null}
        postIsOwned={commentsPost?.isOwned === true}
      />
      <PulseActionSheet ref={optionsRef} />
      <PulseReportSheet ref={reportRef} />
      <PulseEditPostSheet ref={editRef} />
    </>
  );
}

const skeletonColor = "rgba(17,26,50,0.08)";
const skeletonColorStrong = "rgba(17,26,50,0.12)";

const styles = StyleSheet.create({
  listContent: {
    paddingTop: 8,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  errorButton: {
    marginTop: 6,
    minWidth: 200,
  },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
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

  skeletonBlock: {
    backgroundColor: skeletonColor,
    overflow: "hidden",
  },

  skeletonPostCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.border,
    gap: 10,
  },
  skeletonAuthorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  skeletonAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  skeletonAuthorTextWrap: {
    flex: 1,
    gap: 6,
  },
  skeletonAuthorName: {
    width: "42%",
    height: 14,
    borderRadius: 999,
    backgroundColor: skeletonColorStrong,
  },
  skeletonPostMeta: {
    width: "56%",
    height: 12,
    borderRadius: 999,
  },
  skeletonTime: {
    width: 44,
    height: 12,
    borderRadius: 999,
  },
  skeletonBodyOne: {
    width: "92%",
    height: 14,
    borderRadius: 999,
  },
  skeletonBodyTwo: {
    width: "64%",
    height: 14,
    borderRadius: 999,
  },
  skeletonImage: {
    width: "100%",
    height: 200,
    borderRadius: 14,
  },
  skeletonActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    paddingTop: 2,
  },
  skeletonAction: {
    width: 78,
    height: 16,
    borderRadius: 999,
  },
});
