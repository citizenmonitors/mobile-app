// Pulse feed data: discussions, live elections, review reports.
// Swap dummy data for API responses — all consumers use these types.

import { ReviewReportItem } from "@/data/collation";

// Types

/** A post embedded inside a quote card. */
export type PulseQuotedPost = {
  id: string;
  /** The quoted post was deleted. */
  unavailable: boolean;
  author?: string;
  avatarUri?: string;
  body?: string;
  imageUri?: string;
  createdAt?: string;
};

export type PulseDiscussionPost = {
  id: string;
  /** Author name of the content shown (the original author on plain reposts). */
  author: string;
  /** The current user created this feed item (wrote it, reposted or quoted it). */
  isOwned: boolean;
  avatarUri?: string;
  body: string;
  imageUri?: string;
  /** ISO timestamp the post was created. */
  createdAt: string;
  likes: number;
  commentCount: number;
  /** Reposts plus quotes. */
  repostCount: number;
  /** Plain repost: shows the original's content with a "reposted" line. */
  isRepost: boolean;
  /** Quote: the user's own text with the quoted post embedded below. */
  isQuote: boolean;
  /** On reposts and quotes: the original post's id. */
  originalPostId?: string;
  /** On plain reposts: who reposted it. */
  repostedBy?: string;
  /** On plain reposts whose original was deleted. */
  originalUnavailable?: boolean;
  /** On quotes: the post being quoted. */
  quoted?: PulseQuotedPost;
  /** The user has plainly reposted this content. */
  isRepostedByMe: boolean;
  /** On reposts and quotes: the original post is the user's own. */
  originalIsOwned?: boolean;
  /** The text or image was edited after posting. */
  isEdited?: boolean;
};

export type LiveElectionDiscussion = {
  id: string;
  status: "live" | "ended";
  electionTitle: string;
  /** e.g. "Presidential", "Senatorial", "House of Reps", "Gubernatorial", "Local Government" */
  electionType: string;
  activeDiscussions: number;
  /** Route to navigate to collation discussion tab */
  collationId: string;
};

export type PulseReviewReport = ReviewReportItem & {
  electionLabel: string;
};

// Dummy data

/** Party results for the review collation result card */
