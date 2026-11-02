import { apiRequest } from "@/lib/api/http";

/**
 * A post's audience, and the feed filter. "all" is everyone; the others are
 * resolved by the backend from the author's (or viewer's) profile location.
 */
export type PulseVisibilityScope =
  "all" | "state" | "lga" | "ward" | "polling-unit";

export type PulseFeedScope = PulseVisibilityScope;

export type PulseAuthor = {
  /** Always null on anonymous content. Don't store or show it. */
  id: string | null;
  /** Already formatted; "@<anonymousUsername>" for anonymous posts. */
  displayName: string;
  usedAnonymous: boolean;
  /** Profile photo; null when there's none or the content is anonymous. */
  avatarUrl?: string | null;
};

/**
 * The post a repost or quote points at. When that post was deleted, only
 * `{ id, unavailable: true }` comes back.
 */
export type PulseOriginalPost = {
  id: string;
  unavailable?: boolean;
  body?: string;
  imageUrl?: string | null;
  isQuote?: boolean;
  createdAt?: string;
  author?: PulseAuthor;
  /** The reposted/quoted post is the current user's own. */
  isOwnedByCurrentUser?: boolean;
};

export type PulsePost = {
  id: string;
  body: string;
  imageUrl?: string | null;
  visibilityScope: PulseVisibilityScope;
  audienceState?: string | null;
  audienceLga?: string | null;
  audienceWard?: string | null;
  audiencePollingUnit?: string | null;
  /** True for plain reposts and quotes; `isQuote` tells them apart. */
  isRepost: boolean;
  /** A quote's body/image are the quoter's own; a plain repost's are a copy. */
  isQuote?: boolean;
  /** Set when isRepost is true: the post that was reposted or quoted. */
  originalPost?: PulseOriginalPost | null;
  repostCount: number;
  quoteCount?: number;
  /** The user has plainly reposted this post (on a repost card: its original). */
  isRepostedByCurrentUser?: boolean;
  /** Set when the post went out without its image (storage was down). */
  imageUploadFailed?: boolean;
  createdAt: string;
  updatedAt: string;
  /** Set only when the text or image was edited. Shows "Edited". */
  editedAt?: string | null;
  author: PulseAuthor;
  /** Use this (not author ids) to decide on Edit / Delete / Undo repost. */
  isOwnedByCurrentUser: boolean;
  likesCount: number;
  commentsCount: number;
  isLikedByCurrentUser: boolean;
};

export type PulsePostsResponse = {
  posts: PulsePost[];
  total: number;
  page: number;
  limit: number;
  scope?: PulseFeedScope;
};

export type CreatePulsePostPayload = {
  body: string;
  visibilityScope: PulseVisibilityScope;
  useAnonymousDisplay: boolean;
  imageUri?: string | null;
};

export type CreatePulsePostResponse = {
  post: PulsePost;
  /** Present when the image couldn't be uploaded; the post still went out. */
  warning?: string;
};

export type UpdatePulsePostPayload = {
  body?: string;
  visibilityScope?: PulseVisibilityScope;
  useAnonymousDisplay?: boolean;
  removeImage?: boolean;
};

export type DeletePulsePostResponse = {
  id: string;
  deleted: boolean;
  repostsDeleted?: number;
};

export type UndoRepostResponse = {
  id: string;
  removedRepostId: string;
  repostCount: number;
};

export type DeletePulseCommentResponse = {
  id: string;
  deleted: boolean;
};

export type LikePulsePostResponse = {
  id: string;
  likesCount: number;
  isLikedByCurrentUser: boolean;
};

export type PulseComment = {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  /** Set only when the text was edited. Shows "Edited". */
  editedAt?: string | null;
  author: PulseAuthor;
  isOwnedByCurrentUser: boolean;
  likesCount: number;
  isLikedByCurrentUser: boolean;
};

export type PulseCommentsResponse = {
  comments: PulseComment[];
};

export type CreatePulseCommentPayload = {
  body: string;
  useAnonymousDisplay: boolean;
};

export type CreatePulseCommentResponse = {
  comment: PulseComment;
};

export type LikePulseCommentResponse = {
  comment: PulseComment;
};

export type PulseViewer = {
  id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  anonymousUsername?: string;
  useAnonymousIdentity?: boolean;
  profileImageUrl?: string | null;
};

export type PulseLiveElectionStatus = "live" | "ended" | string;

export type PulseLiveElection = {
  id: string;
  electionName: string;
  electionType: string;
  electionLocation: string | null;
  startDate: string;
  endDate: string;
  mockElection: boolean;
  partiesCount: number;
  status: PulseLiveElectionStatus;
};

export type PulseLiveCarouselResponse = {
  status: PulseLiveElectionStatus;
  scope: string;
  total: number;
  elections: PulseLiveElection[];
};

type ReactNativeFile = {
  uri: string;
  name: string;
  type: string;
};

function encodePathSegment(value: string): string {
  return encodeURIComponent(value.trim());
}

function encodeQueryValue(value: string | number): string {
  return encodeURIComponent(String(value));
}

function normalizeBody(value: string): string {
  return value.trim();
}

function getFileExtension(uri: string): string {
  const cleanUri = uri.split("?")[0] ?? uri;
  const extension = cleanUri.split(".").pop()?.toLowerCase();

  if (!extension || extension.length > 5) {
    return "jpg";
  }

  return extension;
}

function getMimeType(uri: string): string {
  const extension = getFileExtension(uri);

  switch (extension) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heic":
    case "heif":
      return "image/heic";
    case "jpeg":
    case "jpg":
    default:
      return "image/jpeg";
  }
}

function createImageFile(uri: string, fallbackName: string): ReactNativeFile {
  const extension = getFileExtension(uri);

  return {
    uri,
    name: `${fallbackName}.${extension}`,
    type: getMimeType(uri),
  };
}

export async function getPulseViewer(): Promise<PulseViewer> {
  const response = await apiRequest<Record<string, unknown>>("/profile/me", {
    method: "GET",
    auth: true,
  });

  const profileImage =
    response.profileImage &&
    typeof response.profileImage === "object" &&
    "url" in response.profileImage
      ? String((response.profileImage as { url?: string }).url ?? "")
      : "";

  return {
    id: typeof response._id === "string" ? response._id : undefined,
    email: typeof response.email === "string" ? response.email : undefined,
    firstName:
      typeof response.firstName === "string" ? response.firstName : undefined,
    lastName:
      typeof response.lastName === "string" ? response.lastName : undefined,
    anonymousUsername:
      typeof response.anonymousUsername === "string"
        ? response.anonymousUsername
        : undefined,
    useAnonymousIdentity:
      typeof response.useAnonymousIdentity === "boolean"
        ? response.useAnonymousIdentity
        : undefined,
    profileImageUrl: profileImage || null,
  };
}

export async function getPulsePosts(params: {
  page: number;
  limit: number;
  scope?: PulseFeedScope;
}): Promise<PulsePostsResponse> {
  const scopeQuery = params.scope
    ? `&scope=${encodeQueryValue(params.scope)}`
    : "";

  return apiRequest<PulsePostsResponse>(
    `/pulse/posts?page=${encodeQueryValue(params.page)}&limit=${encodeQueryValue(
      params.limit,
    )}${scopeQuery}`,
    {
      method: "GET",
      auth: true,
    },
  );
}

function buildPostFormData(payload: CreatePulsePostPayload): FormData {
  const formData = new FormData();

  formData.append("body", normalizeBody(payload.body));
  formData.append("visibilityScope", payload.visibilityScope);
  formData.append(
    "useAnonymousDisplay",
    payload.useAnonymousDisplay ? "true" : "false",
  );

  if (payload.imageUri) {
    formData.append(
      "image",
      createImageFile(payload.imageUri, "pulse-post") as unknown as Blob,
    );
  }

  return formData;
}

export async function createPulsePost(
  payload: CreatePulsePostPayload,
): Promise<CreatePulsePostResponse> {
  return apiRequest<CreatePulsePostResponse>("/pulse/posts", {
    method: "POST",
    auth: true,
    body: buildPostFormData(payload),
  });
}

/**
 * Quote a post: the user's own text (and optional image) on top of it.
 * Allowed any number of times, including on the user's own posts.
 */
export async function quotePulsePost(params: {
  postId: string;
  payload: CreatePulsePostPayload;
}): Promise<CreatePulsePostResponse> {
  return apiRequest<CreatePulsePostResponse>(
    `/pulse/posts/${encodePathSegment(params.postId)}/repost`,
    { method: "POST", auth: true, body: buildPostFormData(params.payload) },
  );
}

const PULSE_WEB_URL = "https://www.citizenmonitors.com/pulse";

export function getPulsePostUrl(postId: string): string {
  return `${PULSE_WEB_URL}?post=${encodeQueryValue(postId.trim())}`;
}

export type PulseReportReason =
  | "spam"
  | "harassment"
  | "hate"
  | "violence"
  | "sexual"
  | "misinformation"
  | "other";

export type PulseReportResponse = {
  report: {
    id: string;
    targetType: "post" | "comment";
    reason: PulseReportReason;
    status: string;
    createdAt: string;
  };
};

export type PulseReportTarget = { postId: string; commentId?: string };

export async function reportPulseContent(
  params: PulseReportTarget & { reason: PulseReportReason; details?: string },
): Promise<PulseReportResponse> {
  const path = params.commentId
    ? `/pulse/posts/${encodePathSegment(params.postId)}/comments/${encodePathSegment(
        params.commentId,
      )}/report`
    : `/pulse/posts/${encodePathSegment(params.postId)}/report`;
  const details = params.details?.trim();

  return apiRequest<PulseReportResponse>(path, {
    method: "POST",
    auth: true,
    body: { reason: params.reason, ...(details ? { details } : {}) },
  });
}

export type PulseBlock = {
  id: string;
  /** The name shown on the blocked content ("@handle" if anonymous). */
  displayName: string;
  blockedAt: string;
};

/** Blocks the author of a post or comment (blocks are made from content). */
export async function blockPulseAuthor(
  target: { postId: string } | { commentId: string },
): Promise<{ block: PulseBlock }> {
  return apiRequest<{ block: PulseBlock }>("/pulse/blocks", {
    method: "POST",
    auth: true,
    body: target,
  });
}

export async function unblockPulseAuthor(
  blockId: string,
): Promise<{ id: string; blocked: boolean }> {
  return apiRequest<{ id: string; blocked: boolean }>(
    `/pulse/blocks/${encodePathSegment(blockId)}`,
    { method: "DELETE", auth: true },
  );
}

export async function getPulseBlocks(): Promise<{ blocks: PulseBlock[] }> {
  return apiRequest<{ blocks: PulseBlock[] }>("/pulse/blocks", {
    method: "GET",
    auth: true,
  });
}

export async function updatePulsePost(params: {
  postId: string;
  payload: UpdatePulsePostPayload;
}): Promise<CreatePulsePostResponse> {
  const { payload } = params;

  return apiRequest<CreatePulsePostResponse>(
    `/pulse/posts/${encodePathSegment(params.postId)}`,
    {
      method: "PATCH",
      auth: true,
      body: {
        ...(payload.body !== undefined
          ? { body: normalizeBody(payload.body) }
          : {}),
        ...(payload.visibilityScope
          ? { visibilityScope: payload.visibilityScope }
          : {}),
        ...(payload.useAnonymousDisplay !== undefined
          ? { useAnonymousDisplay: payload.useAnonymousDisplay }
          : {}),
        ...(payload.removeImage ? { removeImage: true } : {}),
      },
    },
  );
}

export async function deletePulsePost(
  postId: string,
): Promise<DeletePulsePostResponse> {
  return apiRequest<DeletePulsePostResponse>(
    `/pulse/posts/${encodePathSegment(postId)}`,
    { method: "DELETE", auth: true },
  );
}

export async function repostPulsePost(
  postId: string,
): Promise<CreatePulsePostResponse> {
  return apiRequest<CreatePulsePostResponse>(
    `/pulse/posts/${encodePathSegment(postId)}/repost`,
    { method: "POST", auth: true },
  );
}

/** `postId` can be the original post's id or the user's repost id. */
export async function undoRepostPulsePost(
  postId: string,
): Promise<UndoRepostResponse> {
  return apiRequest<UndoRepostResponse>(
    `/pulse/posts/${encodePathSegment(postId)}/repost`,
    { method: "DELETE", auth: true },
  );
}

/** Unlike. Safe to call more than once (unlike POST /like, which toggles). */
export async function unlikePulsePost(
  postId: string,
): Promise<LikePulsePostResponse> {
  return apiRequest<LikePulsePostResponse>(
    `/pulse/posts/${encodePathSegment(postId)}/like`,
    { method: "DELETE", auth: true },
  );
}

export async function updatePulseComment(params: {
  postId: string;
  commentId: string;
  body: string;
}): Promise<CreatePulseCommentResponse> {
  return apiRequest<CreatePulseCommentResponse>(
    `/pulse/posts/${encodePathSegment(params.postId)}/comments/${encodePathSegment(
      params.commentId,
    )}`,
    { method: "PATCH", auth: true, body: { body: normalizeBody(params.body) } },
  );
}

export async function deletePulseComment(params: {
  postId: string;
  commentId: string;
}): Promise<DeletePulseCommentResponse> {
  return apiRequest<DeletePulseCommentResponse>(
    `/pulse/posts/${encodePathSegment(params.postId)}/comments/${encodePathSegment(
      params.commentId,
    )}`,
    { method: "DELETE", auth: true },
  );
}

export async function unlikePulseComment(params: {
  postId: string;
  commentId: string;
}): Promise<LikePulseCommentResponse> {
  return apiRequest<LikePulseCommentResponse>(
    `/pulse/posts/${encodePathSegment(params.postId)}/comments/${encodePathSegment(
      params.commentId,
    )}/like`,
    { method: "DELETE", auth: true },
  );
}

export async function likePulsePost(
  postId: string,
): Promise<LikePulsePostResponse> {
  return apiRequest<LikePulsePostResponse>(
    `/pulse/posts/${encodePathSegment(postId)}/like`,
    {
      method: "POST",
      auth: true,
    },
  );
}

/** One post, for shared links, tapped quotes and notifications. 404 if gone or hidden. */
export async function getPulsePost(postId: string): Promise<{ post: PulsePost }> {
  return apiRequest<{ post: PulsePost }>(
    `/pulse/posts/${encodePathSegment(postId)}`,
    { method: "GET", auth: true },
  );
}

export async function getPulseComments(
  postId: string,
): Promise<PulseCommentsResponse> {
  return apiRequest<PulseCommentsResponse>(
    `/pulse/posts/${encodePathSegment(postId)}/comments`,
    {
      method: "GET",
      auth: true,
    },
  );
}

export async function createPulseComment(params: {
  postId: string;
  payload: CreatePulseCommentPayload;
}): Promise<CreatePulseCommentResponse> {
  return apiRequest<CreatePulseCommentResponse>(
    `/pulse/posts/${encodePathSegment(params.postId)}/comments`,
    {
      method: "POST",
      auth: true,
      body: {
        body: normalizeBody(params.payload.body),
        useAnonymousDisplay: params.payload.useAnonymousDisplay,
      },
    },
  );
}

export async function likePulseComment(params: {
  postId: string;
  commentId: string;
}): Promise<LikePulseCommentResponse> {
  return apiRequest<LikePulseCommentResponse>(
    `/pulse/posts/${encodePathSegment(
      params.postId,
    )}/comments/${encodePathSegment(params.commentId)}/like`,
    {
      method: "POST",
      auth: true,
    },
  );
}

export async function getLiveElectionCarousel(): Promise<PulseLiveCarouselResponse> {
  return apiRequest<PulseLiveCarouselResponse>("/elections/live-carousel", {
    method: "GET",
    auth: true,
  });
}
