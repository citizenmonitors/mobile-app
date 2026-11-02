import {
  InfiniteData,
  QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { dashboardQueryKeys } from "@/hooks/api/useDashboardQuery";
import { ApiError } from "@/lib/api/http";
import {
  createPulseComment,
  CreatePulseCommentPayload,
  createPulsePost,
  CreatePulsePostPayload,
  deletePulseComment,
  deletePulsePost,
  getLiveElectionCarousel,
  getPulseComments,
  getPulsePost,
  getPulsePosts,
  getPulseViewer,
  likePulseComment,
  likePulsePost,
  PulseFeedScope,
  quotePulsePost,
  PulsePost,
  PulsePostsResponse,
  reportPulseContent,
  PulseReportReason,
  PulseReportTarget,
  PulseComment,
  blockPulseAuthor,
  unblockPulseAuthor,
  getPulseBlocks,
  repostPulsePost,
  undoRepostPulsePost,
  unlikePulseComment,
  unlikePulsePost,
  updatePulseComment,
  updatePulsePost,
  UpdatePulsePostPayload,
} from "@/lib/api/pulse.api";

const PULSE_PAGE_LIMIT = 20;

export const pulseQueryKeys = {
  viewer: ["pulse", "viewer"] as const,
  // Prefix key: invalidating it refreshes every scope's feed at once.
  posts: ["pulse", "posts"] as const,
  postsByScope: (scope: PulseFeedScope) => ["pulse", "posts", scope] as const,
  // Under the "posts" prefix so likes, edits, deletes and reposts update it.
  singlePost: (postId: string | null) =>
    ["pulse", "posts", "single", postId] as const,
  comments: (postId: string | null) => ["pulse", "comments", postId] as const,
  liveCarousel: ["pulse", "live-carousel"] as const,
  blocks: ["pulse", "blocks"] as const,
};

type FeedData = InfiniteData<PulsePostsResponse>;

/** Applies `update` to every post in every cached feed (all scopes). */
function updateCachedPosts(
  queryClient: QueryClient,
  update: (posts: PulsePost[]) => PulsePost[],
) {
  queryClient.setQueriesData<FeedData>(
    { queryKey: pulseQueryKeys.posts },
    (current) =>
      current
        ? {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              posts: update(page.posts),
            })),
          }
        : current,
  );
}

function isClientError(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 400 && error.status < 500;
}

export function usePulseViewerQuery() {
  return useQuery({
    queryKey: pulseQueryKeys.viewer,
    queryFn: getPulseViewer,
    staleTime: 60 * 1000,
  });
}

export function useLiveElectionCarouselQuery() {
  return useQuery({
    queryKey: pulseQueryKeys.liveCarousel,
    queryFn: getLiveElectionCarousel,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}

export function usePulsePostsInfiniteQuery(
  scope: PulseFeedScope = "all",
  options: { enabled?: boolean } = {},
) {
  return useInfiniteQuery({
    enabled: options.enabled ?? true,
    queryKey: pulseQueryKeys.postsByScope(scope),
    queryFn: ({ pageParam }) =>
      getPulsePosts({
        page: pageParam,
        limit: PULSE_PAGE_LIMIT,
        scope,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page * lastPage.limit < lastPage.total
        ? lastPage.page + 1
        : undefined,
    // A 400 here usually means "complete your LGA in your profile first" —
    // retrying won't help, so show the message straight away.
    retry: (failureCount, error) => !isClientError(error) && failureCount < 2,
    staleTime: 20 * 1000,
  });
}

/**
 * One post (shared link, tapped quote, notification). Stored in the same
 * page shape as the feed so the cache helpers above update it as well.
 */
export function usePulsePostQuery(postId: string | null) {
  return useQuery<FeedData>({
    queryKey: pulseQueryKeys.singlePost(postId),
    queryFn: async () => {
      const { post } = await getPulsePost(postId as string);
      return {
        pages: [{ posts: [post], total: 1, page: 1, limit: 1 }],
        pageParams: [1],
      };
    },
    enabled: Boolean(postId),
    retry: (failureCount, error) => !isClientError(error) && failureCount < 2,
  });
}

export function useCreatePulsePostMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreatePulsePostPayload) => createPulsePost(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: pulseQueryKeys.posts });
    },
  });
}

export function useQuotePulsePostMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { postId: string; payload: CreatePulsePostPayload }) =>
      quotePulsePost(params),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: pulseQueryKeys.posts });
    },
  });
}

export function useUpdatePulsePostMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { postId: string; payload: UpdatePulsePostPayload }) =>
      updatePulsePost(params),
    onSuccess: async ({ post }) => {
      updateCachedPosts(queryClient, (posts) =>
        posts.map((item) => (item.id === post.id ? post : item)),
      );
      // Editing an original also changes its reposts.
      await queryClient.invalidateQueries({ queryKey: pulseQueryKeys.posts });
    },
  });
}

export function useDeletePulsePostMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (postId: string) => deletePulsePost(postId),
    onSuccess: async ({ id }) => {
      // Deleting an original also deletes its plain reposts.
      updateCachedPosts(queryClient, (posts) =>
        posts.filter(
          (item) =>
            item.id !== id &&
            // Quotes of a deleted post stay ("This post is unavailable").
            (item.isQuote || item.originalPost?.id !== id),
        ),
      );
      await queryClient.invalidateQueries({ queryKey: pulseQueryKeys.posts });
    },
  });
}

export function useRepostPulsePostMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (postId: string) => repostPulsePost(postId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: pulseQueryKeys.posts });
    },
  });
}

export function useUndoRepostPulsePostMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (postId: string) => undoRepostPulsePost(postId),
    onSuccess: async ({ id, removedRepostId, repostCount }) => {
      updateCachedPosts(queryClient, (posts) =>
        posts
          .filter((item) => item.id !== removedRepostId)
          .map((item) => (item.id === id ? { ...item, repostCount } : item)),
      );
      await queryClient.invalidateQueries({ queryKey: pulseQueryKeys.posts });
    },
  });
}

/** Like with POST, unlike with DELETE (POST alone toggles, so never reuse it). */
export function useSetPulsePostLikeMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { postId: string; like: boolean }) =>
      params.like
        ? likePulsePost(params.postId)
        : unlikePulsePost(params.postId),
    onSuccess: (response) => {
      updateCachedPosts(queryClient, (posts) =>
        posts.map((post) =>
          post.id === response.id
            ? {
                ...post,
                likesCount: response.likesCount,
                isLikedByCurrentUser: response.isLikedByCurrentUser,
              }
            : post,
        ),
      );
    },
  });
}

export function usePulseCommentsQuery(postId: string | null) {
  return useQuery({
    queryKey: pulseQueryKeys.comments(postId),
    queryFn: () => getPulseComments(postId ?? ""),
    enabled: Boolean(postId),
    staleTime: 15 * 1000,
  });
}

export function useCreatePulseCommentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      postId: string;
      payload: CreatePulseCommentPayload;
    }) => createPulseComment(params),
    onSuccess: async (_response, variables) => {
      await queryClient.invalidateQueries({
        queryKey: pulseQueryKeys.comments(variables.postId),
      });
      await queryClient.invalidateQueries({ queryKey: pulseQueryKeys.posts });
    },
  });
}

export function useUpdatePulseCommentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { postId: string; commentId: string; body: string }) =>
      updatePulseComment(params),
    onSuccess: async (_response, variables) => {
      await queryClient.invalidateQueries({
        queryKey: pulseQueryKeys.comments(variables.postId),
      });
    },
  });
}

export function useDeletePulseCommentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { postId: string; commentId: string }) =>
      deletePulseComment(params),
    onSuccess: async (_response, variables) => {
      await queryClient.invalidateQueries({
        queryKey: pulseQueryKeys.comments(variables.postId),
      });
      await queryClient.invalidateQueries({ queryKey: pulseQueryKeys.posts });
    },
  });
}

export function useSetPulseCommentLikeMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      postId: string;
      commentId: string;
      like: boolean;
    }) => (params.like ? likePulseComment(params) : unlikePulseComment(params)),
    onSuccess: async (_response, variables) => {
      await queryClient.invalidateQueries({
        queryKey: pulseQueryKeys.comments(variables.postId),
      });
    },
  });
}

/**
 * Reports a post or comment. The server stops returning the reported item
 * (for a repost: the original and all its reposts) to this user, so drop it
 * from the screen straight away.
 */
export function useReportPulseContentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (
      params: PulseReportTarget & {
        reason: PulseReportReason;
        details?: string;
        /** On reposts: the original post's id, to hide its other reposts. */
        originalPostId?: string;
      },
    ) => reportPulseContent(params),
    onSuccess: async (_response, variables) => {
      if (variables.commentId) {
        queryClient.setQueryData<{ comments: PulseComment[] }>(
          pulseQueryKeys.comments(variables.postId),
          (current) =>
            current
              ? {
                  comments: current.comments.filter(
                    (comment) => comment.id !== variables.commentId,
                  ),
                }
              : current,
        );
        await queryClient.invalidateQueries({
          queryKey: pulseQueryKeys.comments(variables.postId),
        });
        return;
      }

      const hidden = new Set(
        [variables.postId, variables.originalPostId].filter(
          Boolean,
        ) as string[],
      );
      updateCachedPosts(queryClient, (posts) =>
        posts.filter(
          (post) =>
            !hidden.has(post.id) &&
            !(post.originalPost && hidden.has(post.originalPost.id)),
        ),
      );
      await queryClient.invalidateQueries({ queryKey: pulseQueryKeys.posts });
    },
  });
}

/** Refreshes everything a block can hide: feeds, comments, the dashboard. */
async function refreshAfterBlockChange(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["pulse"] }),
    queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.dashboard }),
  ]);
}

export function usePulseBlocksQuery() {
  return useQuery({
    queryKey: pulseQueryKeys.blocks,
    queryFn: getPulseBlocks,
  });
}

export function useBlockPulseAuthorMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (target: { postId: string } | { commentId: string }) =>
      blockPulseAuthor(target),
    onSuccess: () => refreshAfterBlockChange(queryClient),
  });
}

export function useUnblockPulseAuthorMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (blockId: string) => unblockPulseAuthor(blockId),
    onSuccess: () => refreshAfterBlockChange(queryClient),
  });
}
