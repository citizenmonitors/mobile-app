import { apiRequest } from "@/lib/api/http";

export type ProfileRole = "observer" | "volunteer" | "public-viewer";

export type ApiFile = {
  location?: string;
  name?: string;
  type?: string;
  size?: number;
  url?: string;
  _id?: string;
  __v?: number;
};

export type MobileNotificationSettingsState = {
  pollingUnitActivity: boolean;
  electionDayAlert: boolean;
  discussionReplies: boolean;
  resultAggregated: boolean;
  reportConfirmed: boolean;
  reportFlagged: boolean;
  securityAlerts: boolean;
  newsletter: boolean;
};

export type MyProfileResponse = {
  mobileMeta?: {
    appVersion?: string;
    deviceId?: string;
    lastLoginAt?: string;
    platform?: string;
    pushToken?: string;
  };
  notifications?: {
    email?: {
      inbox?: boolean;
      election?: boolean;
      newsletter?: boolean;
    };
    mobile?: Partial<MobileNotificationSettingsState>;
  };
  _id?: string;
  role?: ProfileRole;
  email?: string;
  firstName?: string;
  lastName?: string;
  gender?: string;
  dateOfBirth?: string;
  profileImage?: ApiFile;
  state?: string;
  lga?: string;
  ward?: string;
  pollingUnit?: string;
  nationality?: string;
  whyYouJoinUs?: string;
  isRegisteredVoter?: boolean;
  isPoliticalPartyMember?: boolean;
  isElectionWitnessReady?: boolean;
  isOpenToSurvey?: boolean;
  useAnonymousIdentity?: boolean;
  anonymousUsername?: string;
  isObserverInPollingUnit?: boolean;
  pendingObserverVerification?: boolean;
  coverageUpdateCount?: number;
  observerId?: ApiFile[];
  phoneNumber?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
  hasSubmittedRoleForm?: boolean;
  hasSetPassword?: boolean;
  createdAt?: string;
  updatedAt?: string;
  isActive?: boolean;
  lastLogin?: string;
  [key: string]: unknown;
};

export type UpdatePasswordPayload = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export type UpdateProfilePayload = {
  firstName?: string;
  lastName?: string;
  gender?: string;
  dateOfBirth?: string;
  state?: string;
  lga?: string;
  ward?: string;
  pollingUnit?: string;
  anonymousUsername?: string;
  useAnonymousIdentity?: boolean;
  profileImageUri?: string | null;
};

export type UpdateNotificationSettingsResponse = {
  message: string;
  settings: MobileNotificationSettingsState;
};

export type GenerateAnonymousUsernameResponse = {
  message: string;
  anonymousUsername: string;
};

export type UpdateAnonymousIdentityPayload = {
  enabled: boolean;
};

export type UpdateAnonymousIdentityResponse = {
  message: string;
  useAnonymousIdentity: boolean;
  anonymousUsername?: string;
};

export type SubmitFeedbackPayload = {
  title: string;
  message: string;
};

export type SubmitFeedbackResponse = {
  message: string;
  feedbackId: string;
};

export type BankOption = {
  code: string;
  name: string;
};

export type BanksResponse = {
  banks: BankOption[];
};

export type UpgradePublicViewerToVolunteerResponse = {
  message: string;
  user: MyProfileResponse;
};

export type UpgradeVolunteerToObserverPayload = {
  phoneNumber: string;
  pvcFrontUri: string;
  pvcBackUri: string;
};

export type UpgradeVolunteerToObserverResponse = {
  message: string;
  user: MyProfileResponse;
};

type ReactNativeFile = {
  uri: string;
  name: string;
  type: string;
};

type UploadKind = "image" | "document";

const BACKEND_ACCEPTED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "svg",
  "pdf",
]);

function trimOrEmpty(value?: string): string {
  return value?.trim() ?? "";
}

function getRawFileExtension(uri: string): string {
  const cleanUri = uri.split("?")[0] ?? uri;
  const rawExtension = cleanUri.split(".").pop()?.toLowerCase() ?? "";

  if (!rawExtension || rawExtension.length > 5) {
    return "";
  }

  return rawExtension;
}

function normalizeFileExtension(uri: string, kind: UploadKind = "image"): string {
  const extension = getRawFileExtension(uri);

  if (!extension) {
    return kind === "document" ? "pdf" : "jpg";
  }

  if (extension === "jpeg") {
    return "jpg";
  }

  if (extension === "heic" || extension === "heif") {
    return "jpg";
  }

  if (!BACKEND_ACCEPTED_EXTENSIONS.has(extension)) {
    return kind === "document" ? "pdf" : "jpg";
  }

  return extension;
}

function getMimeType(extension: string): string {
  switch (extension) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "pdf":
      return "application/pdf";
    case "jpg":
    case "jpeg":
    default:
      return "image/jpeg";
  }
}

function createNativeFile(
  uri: string,
  fallbackName: string,
  kind: UploadKind = "image"
): ReactNativeFile {
  const extension = normalizeFileExtension(uri, kind);

  return {
    uri,
    name: `${fallbackName}.${extension}`,
    type: getMimeType(extension),
  };
}

function appendFile(
  formData: FormData,
  key: string,
  uri: string,
  fallbackName: string,
  kind: UploadKind = "image"
): void {
  formData.append(
    key,
    createNativeFile(uri, fallbackName, kind) as unknown as Blob
  );
}

function appendTextIfPresent(
  formData: FormData,
  key: string,
  value: string | undefined
): void {
  if (value === undefined) return;

  formData.append(key, value.trim());
}

function appendBooleanIfPresent(
  formData: FormData,
  key: string,
  value: boolean | undefined
): void {
  if (value === undefined) return;

  formData.append(key, value ? "true" : "false");
}

function addTextIfPresent(
  body: Record<string, unknown>,
  key: string,
  value: string | undefined
): void {
  if (value === undefined) return;

  body[key] = value.trim();
}

function addBooleanIfPresent(
  body: Record<string, unknown>,
  key: string,
  value: boolean | undefined
): void {
  if (value === undefined) return;

  body[key] = value;
}

export async function getMyProfile(): Promise<MyProfileResponse> {
  return apiRequest<MyProfileResponse>("/profile/me", {
    method: "GET",
  });
}

export async function updateMyProfile(
  payload: UpdateProfilePayload
): Promise<MyProfileResponse> {
  const hasImage = Boolean(payload.profileImageUri);

  if (hasImage) {
    const formData = new FormData();

    appendTextIfPresent(formData, "firstName", payload.firstName);
    appendTextIfPresent(formData, "lastName", payload.lastName);
    appendTextIfPresent(formData, "gender", payload.gender);
    appendTextIfPresent(formData, "dateOfBirth", payload.dateOfBirth);
    appendTextIfPresent(formData, "state", payload.state);
    appendTextIfPresent(formData, "lga", payload.lga);
    appendTextIfPresent(formData, "ward", payload.ward);
    appendTextIfPresent(formData, "pollingUnit", payload.pollingUnit);
    appendTextIfPresent(
      formData,
      "anonymousUsername",
      payload.anonymousUsername
    );
    appendBooleanIfPresent(
      formData,
      "useAnonymousIdentity",
      payload.useAnonymousIdentity
    );

    if (payload.profileImageUri) {
      appendFile(formData, "profileImage", payload.profileImageUri, "profile");
    }

    return apiRequest<MyProfileResponse>("/profile/me", {
      method: "PUT",
      body: formData,
    });
  }

  const body: Record<string, unknown> = {};

  addTextIfPresent(body, "firstName", payload.firstName);
  addTextIfPresent(body, "lastName", payload.lastName);
  addTextIfPresent(body, "gender", payload.gender);
  addTextIfPresent(body, "dateOfBirth", payload.dateOfBirth);
  addTextIfPresent(body, "state", payload.state);
  addTextIfPresent(body, "lga", payload.lga);
  addTextIfPresent(body, "ward", payload.ward);
  addTextIfPresent(body, "pollingUnit", payload.pollingUnit);
  addTextIfPresent(body, "anonymousUsername", payload.anonymousUsername);
  addBooleanIfPresent(
    body,
    "useAnonymousIdentity",
    payload.useAnonymousIdentity
  );

  return apiRequest<MyProfileResponse>("/profile/me", {
    method: "PUT",
    body,
  });
}

export async function updatePassword(
  payload: UpdatePasswordPayload
): Promise<MyProfileResponse> {
  return apiRequest<MyProfileResponse>("/profile/me/password", {
    method: "PUT",
    body: {
      currentPassword: payload.currentPassword,
      newPassword: payload.newPassword,
      confirmPassword: payload.confirmPassword,
    },
  });
}

export async function getMobileNotificationSettings(): Promise<MobileNotificationSettingsState> {
  return apiRequest<MobileNotificationSettingsState>("/profile/notifications", {
    method: "GET",
  });
}

export async function updateNotificationSettings(
  payload: MobileNotificationSettingsState
): Promise<UpdateNotificationSettingsResponse> {
  return apiRequest<UpdateNotificationSettingsResponse>(
    "/profile/notifications",
    {
      method: "PUT",
      body: payload,
    }
  );
}

export async function generateAnonymousUsername(): Promise<GenerateAnonymousUsernameResponse> {
  return apiRequest<GenerateAnonymousUsernameResponse>(
    "/profile/me/anonymous-username/generate",
    {
      method: "POST",
      body: {},
    }
  );
}

export async function updateAnonymousIdentity(
  payload: UpdateAnonymousIdentityPayload
): Promise<UpdateAnonymousIdentityResponse> {
  return apiRequest<UpdateAnonymousIdentityResponse>(
    "/profile/me/anonymous-identity",
    {
      method: "PUT",
      body: payload,
    }
  );
}

export async function getBanks(): Promise<BanksResponse> {
  return apiRequest<BanksResponse>("/banks", {
    method: "GET",
    auth: false,
  });
}

export async function submitFeedback(
  payload: SubmitFeedbackPayload
): Promise<SubmitFeedbackResponse> {
  return apiRequest<SubmitFeedbackResponse>("/profile/feedback", {
    method: "POST",
    body: {
      title: trimOrEmpty(payload.title),
      message: trimOrEmpty(payload.message),
    },
  });
}

export async function upgradePublicViewerToVolunteer(): Promise<UpgradePublicViewerToVolunteerResponse> {
  return apiRequest<UpgradePublicViewerToVolunteerResponse>(
    "/profile/upgrade/public-viewer-to-volunteer",
    {
      method: "PUT",
      body: {},
    }
  );
}

export async function upgradeVolunteerToObserver(
  payload: UpgradeVolunteerToObserverPayload
): Promise<UpgradeVolunteerToObserverResponse> {
  const formData = new FormData();

  formData.append("phoneNumber", payload.phoneNumber.trim());

  appendFile(formData, "observerId[]", payload.pvcFrontUri, "front-pvc");
  appendFile(formData, "observerId[]", payload.pvcBackUri, "back-pvc");

  return apiRequest<UpgradeVolunteerToObserverResponse>(
    "/profile/upgrade/volunteer-to-observer",
    {
      method: "PUT",
      body: formData,
    }
  );
}

export type DeleteMyAccountResponse = {
  message?: string;
  success?: boolean;
};

/**
 * Permanently deletes the authenticated user's account.
 * Backend contract: DELETE /profile/me
 */
export async function deleteMyAccount(): Promise<DeleteMyAccountResponse> {
  return apiRequest<DeleteMyAccountResponse>("/profile/me", {
    method: "DELETE",
    auth: true,
  });
}