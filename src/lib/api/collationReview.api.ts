// Collation "Review Reports" — Community Verification (agree/flag on
// individual result & incident submissions). Real backend endpoints
// confirmed by the backend engineer with sample request/response bodies.
// IMPORTANT ASSUMPTION (flagged to product/backend — confirm before relying
// on this in production): the backend only gave us a POST for
// `/elections/:id/collation/user-action` (perform agree/flag, returns the
// updated feed). No separate endpoint was given for loading the INITIAL
// list of pending result/incident submissions before any action is taken.
// One of the two sample POST responses came back with the message "Fetched
// polling-unit verification feed (legacy)" — which strongly suggests this
// same route also answers a plain GET with no body and just returns the
// current feed. `getCollationReviewFeed` below calls GET on that same path.
// If that 404s in testing, the fix is a one-line URL/verb change here once
// backend confirms the real listing route.

import { apiRequest } from "@/lib/api/http";

export type CollationReviewPartyVote = {
  party: string;
  count: number;
  _id: string;
};

export type CollationReviewMediaFile = {
  location: string;
  name: string;
  type: string;
  size: number;
  url: string;
  _id: string;
  __v?: number;
};

export type CollationReviewAction = {
  userId: string;
  action: "agree" | "flag" | "unagree" | "unflag";
  _id: string;
  evidenceId?: string;
  flagReason?: string;
};

export type CollationReviewElectionRef = {
  _id: string;
  election?: {
    _id: string;
    electionType: string;
    electionName: string;
  };
  electionLocation?: string | null;
  startDate?: string;
  endDate?: string;
  mockElection?: boolean;
};

export type CollationReviewResultItem = {
  electionTypeId: string;
  /** The submission's own id — this is the `electionId`/targetId used in agree/flag requests. */
  electionId: string;
  electionType: string;
  electionName: string;
  pollingUnit: string;
  electionYear: string;
  uploadedAt: string;
  partiesVotes: CollationReviewPartyVote[];
  voteRating: string;
  voterIntimidation: string;
  voteBuying: string;
  resultPicture: CollationReviewMediaFile | null;
  resultVideo: CollationReviewMediaFile | null;
  agreed: boolean;
  flagged: boolean;
  hidden: boolean;
  priorityLevel?: number;
  actions: CollationReviewAction[];
  timeBegan?: string;
  election?: CollationReviewElectionRef;
  electionLocation?: string | null;
  startDate?: string;
  endDate?: string;
};

export type CollationReviewIncidentItem = {
  electionTypeId: string;
  /** The submission's own id — this is the `electionId`/targetId used in agree/flag requests. */
  electionId: string;
  electionType: string;
  electionName: string;
  electionYear: string;
  pollingUnit: string;
  uploadedAt: string;
  selectIncident: string;
  incidentNote: string;
  electionRating: string;
  incidentPictures: CollationReviewMediaFile[];
  incidentVideos: CollationReviewMediaFile[];
  agreed: boolean;
  flagged: boolean;
  hidden: boolean;
  priorityLevel?: number;
  actions: CollationReviewAction[];
  electionLocation?: string | null;
  startDate?: string;
  endDate?: string;
  election?: CollationReviewElectionRef;
};

export type CollationReviewFeed = {
  results: CollationReviewResultItem[];
  incidentReports: CollationReviewIncidentItem[];
};

export type CollationUserActionResponse = {
  message: string;
  results: CollationReviewFeed;
};

export type CollationUserActionPayload = {
  /** The specific submission being acted on (NOT the election id). */
  targetId: string;
  /** "unagree" / "unflag" undo a prior "agree" / "flag". */
  action: "agree" | "unagree" | "flag" | "unflag";
  dataType: "election" | "incident";
  flagReason?: string;
};

function encodePathSegment(value: string): string {
  return encodeURIComponent(value.trim());
}

export async function getCollationReviewFeed(
  electionId: string
): Promise<CollationUserActionResponse> {
  return apiRequest<CollationUserActionResponse>(
    `/elections/${encodePathSegment(electionId)}/collation/user-action`,
    {
      method: "GET",
      auth: true,
    }
  );
}

export async function submitCollationUserAction(params: {
  electionId: string;
  payload: CollationUserActionPayload;
}): Promise<CollationUserActionResponse> {
  return apiRequest<CollationUserActionResponse>(
    `/elections/${encodePathSegment(params.electionId)}/collation/user-action`,
    {
      method: "POST",
      auth: true,
      body: {
        electionId: params.payload.targetId,
        action: params.payload.action,
        dataType: params.payload.dataType,
        ...(params.payload.flagReason
          ? { flagReason: params.payload.flagReason }
          : {}),
      },
    }
  );
}
