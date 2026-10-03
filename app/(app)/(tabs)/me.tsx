import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AppScreenLoader from "@/components/feedback/AppScreenLoader";
import { useToastContext } from "@/components/feedback/ToastProvider";
import TabBarSpacer from "@/components/layout/TabBarSpacer";
import TourTarget from "@/components/tour/TourTarget";
import BankDetailsBottomSheet, {
  BankFormState,
} from "@/components/me/BankDetailsBottomSheet";
import FeedbackBottomSheet, {
  FeedbackFormState,
} from "@/components/me/FeedbackBottomSheet";
import MeHeader from "@/components/me/MeHeader";
import MeProfileCard from "@/components/me/MeProfileCard";
import MeSection from "@/components/me/MeSection";
import NotificationAlertBottomSheet from "@/components/me/NotificationAlertBottomSheet";
import ObserverRegistrationBottomSheet, {
  ObserverRegistrationFormState,
} from "@/components/me/ObserverRegistrationBottomSheet";
import PollingUnitBottomSheet, {
  PollingUnitFormState,
} from "@/components/me/PollingUnitBottomSheet";
import ProfileBottomSheet, {
  ProfileFormState,
} from "@/components/me/ProfileBottomSheet";
import AppLockBottomSheet from "@/components/me/AppLockBottomSheet";
import SecurityBottomSheet, {
  SecurityFormState,
} from "@/components/me/SecurityBottomSheet";
import AppButton from "@/components/ui/AppButton";
import AppText from "@/components/ui/AppText";
import { Paths } from "@/constants/paths";
import { useAuth } from "@/context/AuthContext";
import { useTourScrollReset } from "@/context/TourContext";
import {
  getMeAccountItems,
  getMeBanner,
  getMeOtherItems,
  MeMenuItem,
  MeUser,
} from "@/data/me";
import {
  useLocalGovernmentsQuery,
  usePollingUnitsQuery,
  useStatesQuery,
  useWardsQuery,
} from "@/hooks/api/useLocationQueries";
import { useElectionVaultQuery } from "@/hooks/api/useElectionVaultQuery";
import { useMyProfileQuery } from "@/hooks/api/useMyProfileQuery";
import {
  useDeleteMyAccountMutation,
  useGenerateAnonymousUsernameMutation,
  useSubmitFeedbackMutation,
  useUpdateAnonymousIdentityMutation,
  useUpdateMyProfileMutation,
  useUpdateNotificationSettingsMutation,
  useUpdatePasswordMutation,
  useUpgradePublicViewerToVolunteerMutation,
  useUpgradeVolunteerToObserverMutation,
} from "@/hooks/api/useProfileMutations";
import {
  useBanksQuery,
  useMobileNotificationSettingsQuery,
} from "@/hooks/api/useProfileSupportQueries";
import {
  BanksResponse,
  MobileNotificationSettingsState,
  MyProfileResponse,
} from "@/lib/api/profile.api";
import {
  getDeviceSecurityLabel,
  isAppLockEnabled,
  isDeviceSecurityAvailable,
  promptDeviceAuthentication,
  setAppLockEnabled,
} from "@/lib/auth/appLockPreference";
import { signOutFromGoogle } from "@/lib/auth/googleAuth";
import { Theme } from "@/theme";
import { BirthdayValue, Gender } from "@/types/onboarding";

type BankOption = {
  code?: string;
  name: string;
};

type BanksLikeResponse = BanksResponse | BankOption[] | null | undefined;

const EMPTY_BIRTHDAY: BirthdayValue = {
  day: 0,
  month: "",
  year: 0,
  formatted: "",
};

const DEFAULT_NOTIFICATION_SETTINGS: MobileNotificationSettingsState = {
  pollingUnitActivity: true,
  electionDayAlert: false,
  discussionReplies: false,
  resultAggregated: false,
  reportConfirmed: false,
  reportFlagged: false,
  securityAlerts: false,
  newsletter: true,
};

const DEFAULT_FEEDBACK_FORM: FeedbackFormState = {
  title: "Feedback",
  message: "",
};

const ME_TOUR_TARGET_IDS = ["me.my-account"];

function getFullName(profile: MyProfileResponse): string {
  return [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
}

function getDisplayName(profile: MyProfileResponse): string {
  return getFullName(profile) || profile.email || "Citizen";
}

function getPollingUnitLabel(profile: MyProfileResponse): string {
  return profile.pollingUnit?.trim() || "No polling unit assigned";
}

function getUserType(role?: string): MeUser["userType"] {
  if (role === "observer") return "observer";
  if (role === "volunteer") return "volunteer";

  return "public-viewer";
}

function getVerificationStatus(
  profile: MyProfileResponse
): MeUser["verificationStatus"] {
  if (profile.role !== "observer") return "none";

  return profile.pendingObserverVerification ? "pending" : "verified";
}

function getRoleLabel(profile: MyProfileResponse): string {
  const pollingUnit = profile.pollingUnit?.trim();

  switch (profile.role) {
    case "observer":
      return pollingUnit ? `Observer at ${pollingUnit}` : "Citizen Observer";
    case "volunteer":
      return pollingUnit ? `Volunteer at ${pollingUnit}` : "Citizen Volunteer";
    case "public-viewer":
      return "Public Viewer";
    default:
      return "Citizen";
  }
}

function getUsername(profile: MyProfileResponse): string {
  if (profile.anonymousUsername?.trim()) {
    return profile.anonymousUsername.trim();
  }

  const fallback =
    profile.email?.split("@")[0] || profile.firstName || "citizen";

  return fallback.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
}

function buildMeUser(
  profile: MyProfileResponse,
  vault?: { reportsCount: number; electionsCount: number; incidentsCount: number }
): MeUser {
  return {
    fullName: getDisplayName(profile),
    username: getUsername(profile),
    roleLabel: getRoleLabel(profile),
    userType: getUserType(profile.role),
    verificationStatus: getVerificationStatus(profile),
    pollingUnit: getPollingUnitLabel(profile),
    avatarUri: profile.profileImage?.url,
    pvcVerifiedDate:
      profile.role === "observer" && !profile.pendingObserverVerification
        ? profile.updatedAt ?? profile.createdAt
        : undefined,
    reportsCount: vault?.reportsCount ?? 0,
    electionsCount: vault?.electionsCount ?? 0,
    incidentsCount: vault?.incidentsCount ?? 0,
  };
}

function toBirthdayValue(dateOfBirth?: string): BirthdayValue {
  if (!dateOfBirth) return EMPTY_BIRTHDAY;

  const date = new Date(dateOfBirth);

  if (Number.isNaN(date.getTime())) return EMPTY_BIRTHDAY;

  const month = new Intl.DateTimeFormat("en", {
    month: "long",
    timeZone: "UTC",
  }).format(date);

  const formatted = new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);

  return {
    day: date.getUTCDate(),
    month,
    year: date.getUTCFullYear(),
    formatted,
  };
}

function toGender(value?: string): Gender {
  if (value === "Male" || value === "Female") return value;

  return "";
}

function monthNameToNumber(month: string): number {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const index = months.findIndex(
    (item) => item.toLowerCase() === month.toLowerCase()
  );

  return index >= 0 ? index + 1 : 0;
}

function toApiDateOfBirth(birthday: BirthdayValue): string {
  if (!birthday.day || !birthday.month || !birthday.year) return "";

  const month = monthNameToNumber(birthday.month);

  if (!month) return "";

  const yyyy = String(birthday.year).padStart(4, "0");
  const mm = String(month).padStart(2, "0");
  const dd = String(birthday.day).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function buildProfileForm(profile: MyProfileResponse): ProfileFormState {
  return {
    firstName: profile.firstName ?? "",
    lastName: profile.lastName ?? "",
    birthday: toBirthdayValue(profile.dateOfBirth),
    gender: toGender(profile.gender),
    avatarUri: profile.profileImage?.url ?? null,
    avatarChanged: false,
  };
}

function buildPollingUnitForm(profile: MyProfileResponse): PollingUnitFormState {
  return {
    state: profile.state ?? "",
    lga: profile.lga ?? "",
    ward: profile.ward ?? "",
    pollingUnit: profile.pollingUnit ?? "",
  };
}

function applyPollingUnitOverride(
  profile: MyProfileResponse,
  override: PollingUnitFormState | null
): MyProfileResponse {
  if (!override) return profile;

  return {
    ...profile,
    state: override.state,
    lga: override.lga,
    ward: override.ward,
    pollingUnit: override.pollingUnit,
  };
}

function buildNotificationSettings(
  profile?: MyProfileResponse | null,
  remote?: Partial<MobileNotificationSettingsState> | null
): MobileNotificationSettingsState {
  return {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...(profile?.notifications?.mobile ?? {}),
    ...(remote ?? {}),
  };
}

function buildObserverForm(
  profile: MyProfileResponse
): ObserverRegistrationFormState {
  return {
    phoneNumber: profile.phoneNumber ?? "",
    pvcFrontUri: null,
    pvcBackUri: null,
  };
}

function buildBankForm(profile: MyProfileResponse): BankFormState {
  return {
    bankName: profile.bankName ?? "",
    accountNumber: profile.bankAccountNumber ?? "",
    accountFullName: profile.bankAccountName ?? "",
  };
}

function applyAnonymousDraft(
  profile: MyProfileResponse,
  draftPublicName: string
): MyProfileResponse {
  const cleanName = draftPublicName.trim();

  if (!cleanName) return profile;

  return {
    ...profile,
    anonymousUsername: cleanName,
  };
}

function normalizeBankOptions(
  response: BanksLikeResponse,
  fallbackBankName?: string | null
): string[] {
  const banks = Array.isArray(response) ? response : response?.banks ?? [];

  const names = banks
    .map((bank) => bank.name?.trim())
    .filter((name): name is string => Boolean(name));

  const uniqueNames = Array.from(new Set(names)).sort((a, b) =>
    a.localeCompare(b)
  );

  const cleanFallback = fallbackBankName?.trim();

  if (uniqueNames.length > 0) {
    return cleanFallback && !uniqueNames.includes(cleanFallback)
      ? [cleanFallback, ...uniqueNames]
      : uniqueNames;
  }

  return cleanFallback ? [cleanFallback] : [];
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function MeScreenSkeleton() {
  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <View style={styles.screen}>
        <LinearGradient
          colors={["#EEF5DB", "#F5F2DE", "#FAF8EE", "#F7F7F2"]}
          locations={[0, 0.24, 0.6, 1]}
          style={styles.gradientBg}
        />

        <View style={styles.content}>
          <View style={styles.skeletonHeader}>
            <View style={styles.skeletonAvatar} />
            <View style={styles.skeletonHeaderText}>
              <View style={styles.skeletonLineLarge} />
              <View style={styles.skeletonLineMedium} />
              <View style={styles.skeletonLineSmall} />
              <View style={styles.skeletonLineTiny} />
            </View>
          </View>

          <View style={styles.skeletonBanner} />

          <View style={styles.skeletonSectionTitle} />
          <View style={styles.skeletonCard}>
            {[0, 1, 2, 3].map((item) => (
              <View key={item} style={styles.skeletonRow}>
                <View style={styles.skeletonRowIcon} />
                <View style={styles.skeletonRowContent}>
                  <View style={styles.skeletonRowLine} />
                  <View style={styles.skeletonRowSubLine} />
                </View>
              </View>
            ))}
          </View>

          <View style={styles.skeletonSectionTitle} />
          <View style={styles.skeletonCard}>
            {[0, 1, 2].map((item) => (
              <View key={item} style={styles.skeletonRow}>
                <View style={styles.skeletonRowIcon} />
                <View style={styles.skeletonRowContent}>
                  <View style={styles.skeletonRowLine} />
                  <View style={styles.skeletonRowSubLine} />
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

export { default as ErrorBoundary } from "@/components/app/RouteErrorFallback";

export default function MeScreen() {
  const { signOut } = useAuth();
  const { showToast } = useToastContext();

  const { profile, isInitialProfileLoading, isFetching, refetch, error } =
    useMyProfileQuery();

  const vaultQuery = useElectionVaultQuery();

  const banksQuery = useBanksQuery();
  const notificationsQuery = useMobileNotificationSettingsQuery();

  const updateMyProfileMutation = useUpdateMyProfileMutation();
  const updatePasswordMutation = useUpdatePasswordMutation();
  const updateNotificationSettingsMutation =
    useUpdateNotificationSettingsMutation();
  const generateAnonymousUsernameMutation =
    useGenerateAnonymousUsernameMutation();
  const updateAnonymousIdentityMutation = useUpdateAnonymousIdentityMutation();
  const submitFeedbackMutation = useSubmitFeedbackMutation();
  const upgradePublicViewerToVolunteerMutation =
    useUpgradePublicViewerToVolunteerMutation();
  const upgradeVolunteerToObserverMutation =
    useUpgradeVolunteerToObserverMutation();
  const deleteMyAccountMutation = useDeleteMyAccountMutation();

  const scrollViewRef = useRef<ScrollView>(null);

  useTourScrollReset(scrollViewRef, ME_TOUR_TARGET_IDS);

  const [profileForm, setProfileForm] = useState<ProfileFormState>({
    firstName: "",
    lastName: "",
    birthday: EMPTY_BIRTHDAY,
    gender: "",
    avatarUri: null,
    avatarChanged: false,
  });

  const [securityForm, setSecurityForm] = useState<SecurityFormState>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [pollingUnitForm, setPollingUnitForm] = useState<PollingUnitFormState>({
    state: "",
    lga: "",
    ward: "",
    pollingUnit: "",
  });

  const [savedPollingUnitOverride, setSavedPollingUnitOverride] =
    useState<PollingUnitFormState | null>(null);

  const [pollingUnitSaving, setPollingUnitSaving] = useState(false);

  const [notificationSettings, setNotificationSettings] =
    useState<MobileNotificationSettingsState>(DEFAULT_NOTIFICATION_SETTINGS);

  const [observerForm, setObserverForm] =
    useState<ObserverRegistrationFormState>({
      phoneNumber: "",
      pvcFrontUri: null,
      pvcBackUri: null,
    });

  const [bankForm, setBankForm] = useState<BankFormState>({
    bankName: "",
    accountNumber: "",
    accountFullName: "",
  });

  const [feedbackForm, setFeedbackForm] =
    useState<FeedbackFormState>(DEFAULT_FEEDBACK_FORM);

  const [draftPublicName, setDraftPublicName] = useState("");

  const profileSheetRef = useRef<BottomSheetModal>(null);
  const securitySheetRef = useRef<BottomSheetModal>(null);
  const appLockSheetRef = useRef<BottomSheetModal>(null);

  // ── App Lock (biometric) preference — available to every role
  const [appLockEnabled, setAppLockEnabledState] = useState(false);
  const [appLockSupported, setAppLockSupported] = useState(false);
  const [appLockMethod, setAppLockMethod] = useState("device passcode");
  const [appLockBusy, setAppLockBusy] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      const [enabled, supported, label] = await Promise.all([
        isAppLockEnabled(),
        isDeviceSecurityAvailable(),
        getDeviceSecurityLabel(),
      ]);

      if (!active) return;

      setAppLockEnabledState(enabled);
      setAppLockSupported(supported);
      setAppLockMethod(label);
    })();

    return () => {
      active = false;
    };
  }, []);

  const handleToggleAppLock = async (next: boolean): Promise<void> => {
    if (appLockBusy) return;
    setAppLockBusy(true);

    try {
      // Turning it ON must be proven — otherwise someone holding the phone
      // could enable a lock the owner can't pass. Turning it OFF is also
      // verified so a thief can't silently disable it.
      const confirmed = await promptDeviceAuthentication(
        next ? "Confirm to turn on App Lock" : "Confirm to turn off App Lock"
      );

      if (!confirmed) {
        showToast({
          type: "error",
          message: "Verification failed. App Lock was not changed.",
        });
        return;
      }

      await setAppLockEnabled(next);
      setAppLockEnabledState(next);

      showToast({
        type: "success",
        message: next
          ? "App Lock is on. You'll verify each time you open the app."
          : "App Lock is off.",
      });
    } finally {
      setAppLockBusy(false);
    }
  };
  const pollingUnitSheetRef = useRef<BottomSheetModal>(null);
  const notificationSheetRef = useRef<BottomSheetModal>(null);
  const observerSheetRef = useRef<BottomSheetModal>(null);
  const bankSheetRef = useRef<BottomSheetModal>(null);
  const feedbackSheetRef = useRef<BottomSheetModal>(null);

  const birthdaySheetRef = useRef<BottomSheetModal>(null);
  const genderSheetRef = useRef<BottomSheetModal>(null);

  /*
   * Re-seed every form when the profile (or notification settings) arrive or
   * change. Adjusted during render rather than in an effect: React restarts
   * the render immediately instead of committing, so the sheets never show a
   * frame of stale/empty values after a refetch.
   */
  const [lastFormSeed, setLastFormSeed] = useState<{
    profile: typeof profile;
    settings: typeof notificationsQuery.data;
  }>({ profile: null, settings: undefined });

  if (
    profile &&
    (profile !== lastFormSeed.profile ||
      notificationsQuery.data !== lastFormSeed.settings)
  ) {
    setLastFormSeed({ profile, settings: notificationsQuery.data });

    setProfileForm(buildProfileForm(profile));
    setPollingUnitForm(buildPollingUnitForm(profile));
    setSavedPollingUnitOverride(null);
    setObserverForm(buildObserverForm(profile));
    setBankForm(buildBankForm(profile));
    setDraftPublicName(profile.anonymousUsername ?? "");
    setNotificationSettings((previous) =>
      buildNotificationSettings(profile, notificationsQuery.data ?? previous)
    );
  }

  const profileWithDraftPublicName = useMemo(() => {
    if (!profile) return null;

    return applyAnonymousDraft(profile, draftPublicName);
  }, [draftPublicName, profile]);

  const displayProfile = useMemo(() => {
    if (!profileWithDraftPublicName) return null;

    return applyPollingUnitOverride(
      profileWithDraftPublicName,
      savedPollingUnitOverride
    );
  }, [profileWithDraftPublicName, savedPollingUnitOverride]);

  const meUser = useMemo(() => {
    if (!displayProfile) return null;

    const vaultData = vaultQuery.data;
    const vaultResults = vaultData?.results ?? [];
    const vaultIncidents = vaultData?.incidents ?? [];
    const uniqueElectionCount = new Set([
      ...vaultResults.map((r) => r.election?._id).filter(Boolean),
      ...vaultIncidents.map((r) => r.election?._id).filter(Boolean),
    ]).size;

    return buildMeUser(displayProfile, {
      reportsCount: vaultData?.summary.totalSubmissions ?? 0,
      electionsCount: uniqueElectionCount,
      incidentsCount: vaultData?.summary.incidentsUploaded ?? 0,
    });
  }, [displayProfile, vaultQuery.data]);

  const banner = useMemo(() => {
    if (!meUser) return null;

    return getMeBanner(meUser);
  }, [meUser]);

  const accountItems = useMemo(() => {
    if (!meUser) return [];

    return getMeAccountItems(meUser);
  }, [meUser]);

  const otherItems = useMemo(() => getMeOtherItems(), []);

  const statesQuery = useStatesQuery();
  const lgasQuery = useLocalGovernmentsQuery(pollingUnitForm.state);
  const wardsQuery = useWardsQuery(pollingUnitForm.state, pollingUnitForm.lga);
  const pollingUnitsQuery = usePollingUnitsQuery(
    pollingUnitForm.state,
    pollingUnitForm.lga,
    pollingUnitForm.ward
  );

  const stateOptions = useMemo(
    () => statesQuery.data ?? [],
    [statesQuery.data]
  );

  const lgaOptions = useMemo(() => lgasQuery.data ?? [], [lgasQuery.data]);

  const wardOptions = useMemo(() => wardsQuery.data ?? [], [wardsQuery.data]);

  const pollingUnitOptions = useMemo(
    () => pollingUnitsQuery.data ?? [],
    [pollingUnitsQuery.data]
  );

  const bankOptions = useMemo(
    () => normalizeBankOptions(banksQuery.data, profile?.bankName),
    [banksQuery.data, profile?.bankName]
  );

  const isElectionLive = false;

  const isMutating =
    updateMyProfileMutation.isPending ||
    pollingUnitSaving ||
    updatePasswordMutation.isPending ||
    updateNotificationSettingsMutation.isPending ||
    generateAnonymousUsernameMutation.isPending ||
    updateAnonymousIdentityMutation.isPending ||
    submitFeedbackMutation.isPending ||
    upgradePublicViewerToVolunteerMutation.isPending ||
    upgradeVolunteerToObserverMutation.isPending ||
    deleteMyAccountMutation.isPending;

  const handleGenerateAnonymousUsername = async () => {
    try {
      const response = await generateAnonymousUsernameMutation.mutateAsync();

      setDraftPublicName(response.anonymousUsername);

      showToast({
        message: "Anonymous name generated. Tap Save Changes to apply it.",
        type: "success",
      });
    } catch (mutationError) {
      showToast({
        message: getErrorMessage(
          mutationError,
          "Unable to generate anonymous username."
        ),
        type: "error",
      });
    }
  };

  const handleUpdateProfile = async () => {
    const firstName = profileForm.firstName.trim();
    const lastName = profileForm.lastName.trim();
    const gender = profileForm.gender.trim();
    const dateOfBirth = toApiDateOfBirth(profileForm.birthday);

    if (!firstName || !lastName) {
      showToast({
        message: "Please enter your first and last name.",
        type: "error",
      });
      return;
    }

    if (!gender) {
      showToast({
        message: "Please select your gender.",
        type: "error",
      });
      return;
    }

    if (!dateOfBirth) {
      showToast({
        message: "Please select a valid birthday.",
        type: "error",
      });
      return;
    }

    try {
      await updateMyProfileMutation.mutateAsync({
        firstName,
        lastName,
        gender,
        dateOfBirth,
        anonymousUsername: draftPublicName.trim() || undefined,
        profileImageUri:
          profileForm.avatarChanged && profileForm.avatarUri
            ? profileForm.avatarUri
            : null,
      });

      if (draftPublicName.trim()) {
        await updateAnonymousIdentityMutation.mutateAsync({
          enabled: true,
        });
      }

      await refetch();

      profileSheetRef.current?.dismiss();

      showToast({
        message: "Profile updated successfully.",
        type: "success",
      });
    } catch (mutationError) {
      showToast({
        message: getErrorMessage(mutationError, "Unable to update profile."),
        type: "error",
      });
    }
  };

  const handleUpdatePassword = async () => {
    if (
      !securityForm.currentPassword ||
      !securityForm.newPassword ||
      !securityForm.confirmPassword
    ) {
      showToast({
        message: "Please fill all password fields.",
        type: "error",
      });
      return;
    }

    if (securityForm.newPassword !== securityForm.confirmPassword) {
      showToast({
        message: "Passwords do not match.",
        type: "error",
      });
      return;
    }

    try {
      await updatePasswordMutation.mutateAsync({
        currentPassword: securityForm.currentPassword,
        newPassword: securityForm.newPassword,
        confirmPassword: securityForm.confirmPassword,
      });

      setSecurityForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });

      securitySheetRef.current?.dismiss();

      showToast({
        message: "Password updated successfully.",
        type: "success",
      });
    } catch (mutationError) {
      showToast({
        message: getErrorMessage(mutationError, "Unable to update password."),
        type: "error",
      });
    }
  };

  const handleUpdatePollingUnit = async () => {
    if (isElectionLive) {
      showToast({
        message: "Polling unit changes are locked while an election is live.",
        type: "error",
      });
      return;
    }

    if (
      !pollingUnitForm.state.trim() ||
      !pollingUnitForm.lga.trim() ||
      !pollingUnitForm.ward.trim() ||
      !pollingUnitForm.pollingUnit.trim()
    ) {
      showToast({
        message: "Please complete your polling unit details.",
        type: "error",
      });
      return;
    }

    try {
      setPollingUnitSaving(true);

      setSavedPollingUnitOverride({
        state: pollingUnitForm.state.trim(),
        lga: pollingUnitForm.lga.trim(),
        ward: pollingUnitForm.ward.trim(),
        pollingUnit: pollingUnitForm.pollingUnit.trim(),
      });

      pollingUnitSheetRef.current?.dismiss();

      showToast({
        message: "Polling unit details updated.",
        type: "success",
      });
    } finally {
      setPollingUnitSaving(false);
    }
  };

  const handleUpdateNotifications = async () => {
    try {
      const response =
        await updateNotificationSettingsMutation.mutateAsync(
          notificationSettings
        );

      setNotificationSettings(response.settings);
      notificationSheetRef.current?.dismiss();

      showToast({
        message: response.message ?? "Notification settings updated.",
        type: "success",
      });
    } catch (mutationError) {
      showToast({
        message: getErrorMessage(
          mutationError,
          "Unable to update notification settings."
        ),
        type: "error",
      });
    }
  };

  const handleUpgradePublicViewerToVolunteer = async () => {
    try {
      const response =
        await upgradePublicViewerToVolunteerMutation.mutateAsync();

      await refetch();

      showToast({
        message:
          response.message ??
          "Your account has been upgraded to volunteer successfully.",
        type: "success",
      });
    } catch (mutationError) {
      showToast({
        message: getErrorMessage(
          mutationError,
          "Unable to upgrade account to volunteer."
        ),
        type: "error",
      });
    }
  };

  const confirmPublicViewerUpgrade = () => {
    Alert.alert(
      "Upgrade to Volunteer",
      "You will be able to participate in polling unit activity after this upgrade.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Upgrade",
          onPress: () => {
            void handleUpgradePublicViewerToVolunteer();
          },
        },
      ]
    );
  };

  const handleUpgradeVolunteerToObserver = async () => {
    const phoneNumber = observerForm.phoneNumber.trim();

    if (!phoneNumber || phoneNumber.length < 7) {
      showToast({
        message: "Please enter a valid phone number.",
        type: "error",
      });
      return;
    }

    if (!observerForm.pvcFrontUri || !observerForm.pvcBackUri) {
      showToast({
        message: "Please upload the front and back of your PVC.",
        type: "error",
      });
      return;
    }

    try {
      const response = await upgradeVolunteerToObserverMutation.mutateAsync({
        phoneNumber,
        pvcFrontUri: observerForm.pvcFrontUri,
        pvcBackUri: observerForm.pvcBackUri,
      });

      observerSheetRef.current?.dismiss();

      await refetch();

      showToast({
        message:
          response.message ??
          "Observer application submitted successfully. Verification is pending.",
        type: "success",
      });
    } catch (mutationError) {
      showToast({
        message: getErrorMessage(
          mutationError,
          "Unable to submit observer application."
        ),
        type: "error",
      });
    }
  };

  const handleSubmitFeedback = async () => {
    const title = feedbackForm.title.trim();
    const message = feedbackForm.message.trim();

    if (title.length < 2) {
      showToast({
        message: "Please enter a feedback title.",
        type: "error",
      });
      return;
    }

    if (message.length < 5) {
      showToast({
        message: "Please enter a more detailed feedback message.",
        type: "error",
      });
      return;
    }

    try {
      const response = await submitFeedbackMutation.mutateAsync({
        title,
        message,
      });

      feedbackSheetRef.current?.dismiss();
      setFeedbackForm(DEFAULT_FEEDBACK_FORM);

      showToast({
        message: response.message ?? "Feedback submitted successfully.",
        type: "success",
      });
    } catch (mutationError) {
      showToast({
        message: getErrorMessage(mutationError, "Unable to submit feedback."),
        type: "error",
      });
    }
  };

  const handleUpgradeEntry = () => {
    if (profile?.role === "volunteer") {
      observerSheetRef.current?.present();
      return;
    }

    if (profile?.role === "public-viewer") {
      confirmPublicViewerUpgrade();
      return;
    }

    showToast({
      message: "Your account is already on the observer track.",
      type: "success",
    });
  };

  const handleDeleteAccount = async () => {
    try {
      await deleteMyAccountMutation.mutateAsync();
      await signOutFromGoogle().catch(() => undefined);
      await signOut();
      showToast({
        message: "Your account has been deleted.",
        type: "success",
      });
      router.replace(Paths.welcome);
    } catch (mutationError) {
      showToast({
        message: getErrorMessage(
          mutationError,
          "Unable to delete your account. Please try again."
        ),
        type: "error",
      });
    }
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This permanently deletes your Citizen Monitors account and associated data from our servers. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Confirm deletion",
              "Are you sure you want to permanently delete your account?",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete Account",
                  style: "destructive",
                  onPress: () => {
                    void handleDeleteAccount();
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleItemPress = (item: MeMenuItem) => {
    switch (item.id) {
      case "personal-profile":
        profileSheetRef.current?.present();
        return;
      case "security":
        securitySheetRef.current?.present();
        return;
      case "app-lock":
        appLockSheetRef.current?.present();
        return;
      case "polling-unit":
        pollingUnitSheetRef.current?.present();
        return;
      case "polling-unit-locator":
        router.push(Paths.voterPollingUnitLocator);
        return;
      case "notifications":
        notificationSheetRef.current?.present();
        return;
      case "upgrade-user":
        handleUpgradeEntry();
        return;
      case "pvc-verification":
        showToast({
          message:
            "PVC update is not available yet. The backend team will provide the separate endpoint.",
          type: "success",
        });
        return;
      case "bank-details":
        bankSheetRef.current?.present();
        return;
      case "citizen-academy":
        router.push(Paths.voterCitizenAcademy);
        return;
      case "archive-reports":
        router.push(Paths.appArchiveReports);
        return;
      case "digital-vault":
        router.push(Paths.appDigitalVault);
        return;
      case "support-faq":
        router.push(Paths.appHelpSupport);
        return;
      case "feedback":
        feedbackSheetRef.current?.present();
        return;
      case "delete-account":
        confirmDeleteAccount();
        return;
      case "sign-out":
        Alert.alert("Sign Out", "Are you sure you want to log out?", [
          { text: "Cancel", style: "cancel" },
          {
            text: "Sign Out",
            style: "destructive",
            onPress: () => {
              void signOut();
              router.replace(Paths.welcome);
            },
          },
        ]);
        return;
    }
  };

  const handleBannerPress = () => {
    handleUpgradeEntry();
  };

  if (isInitialProfileLoading) {
    return <MeScreenSkeleton />;
  }

  if (!profile || !displayProfile || !meUser || !banner) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={[styles.screen, styles.emptyState]}>
          <AppText style={styles.emptyTitle}>Profile unavailable</AppText>
          <AppText style={styles.emptyText}>
            We could not load your profile. Check your connection and try again.
          </AppText>

          <AppButton
            title="Retry"
            onPress={() => {
              void refetch();
            }}
          />

          {error ? (
            <AppText style={styles.errorText}>
              {getErrorMessage(error, "Unknown error")}
            </AppText>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <View style={styles.screen}>
        <LinearGradient
          colors={["#EEF5DB", "#F5F2DE", "#FAF8EE", "#F7F7F2"]}
          locations={[0, 0.24, 0.6, 1]}
          style={styles.gradientBg}
        />

        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          bounces
        >
          <View style={styles.headerWrap}>
            <MeHeader user={meUser} />
          </View>

          <MeProfileCard banner={banner} onPress={handleBannerPress} />

          <TourTarget id="me.my-account" style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>MY ACCOUNT</AppText>
            <MeSection items={accountItems} onItemPress={handleItemPress} />
          </TourTarget>

          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>OTHERS</AppText>
            <MeSection items={otherItems} onItemPress={handleItemPress} />
          </View>

          <TabBarSpacer />
        </ScrollView>

        <ProfileBottomSheet
          ref={profileSheetRef}
          value={profileForm}
          onChange={setProfileForm}
          onSave={() => {
            void handleUpdateProfile();
          }}
          birthdaySheetRef={birthdaySheetRef}
          genderSheetRef={genderSheetRef}
          publicName={draftPublicName}
          generatingPublicName={generateAnonymousUsernameMutation.isPending}
          saving={
            updateMyProfileMutation.isPending ||
            updateAnonymousIdentityMutation.isPending
          }
          currentAvatarUri={profile.profileImage?.url ?? null}
          onGeneratePublicName={() => {
            void handleGenerateAnonymousUsername();
          }}
        />

        <SecurityBottomSheet
          ref={securitySheetRef}
          value={securityForm}
          onChange={setSecurityForm}
          onSave={() => {
            void handleUpdatePassword();
          }}
          saving={updatePasswordMutation.isPending}
        />

        <AppLockBottomSheet
          ref={appLockSheetRef}
          enabled={appLockEnabled}
          deviceSupported={appLockSupported}
          methodLabel={appLockMethod}
          busy={appLockBusy}
          onToggle={(next) => {
            void handleToggleAppLock(next);
          }}
        />

        <PollingUnitBottomSheet
          ref={pollingUnitSheetRef}
          value={pollingUnitForm}
          onChange={setPollingUnitForm}
          onSave={() => {
            void handleUpdatePollingUnit();
          }}
          stateOptions={stateOptions}
          lgaOptions={lgaOptions}
          wardOptions={wardOptions}
          pollingUnitOptions={pollingUnitOptions}
          saving={pollingUnitSaving}
          isElectionLive={isElectionLive}
        />

        <NotificationAlertBottomSheet
          ref={notificationSheetRef}
          value={notificationSettings}
          onChange={setNotificationSettings}
          onSave={() => {
            void handleUpdateNotifications();
          }}
          saving={updateNotificationSettingsMutation.isPending}
        />

        <ObserverRegistrationBottomSheet
          ref={observerSheetRef}
          value={observerForm}
          onChange={setObserverForm}
          onSubmit={() => {
            void handleUpgradeVolunteerToObserver();
          }}
          submitting={upgradeVolunteerToObserverMutation.isPending}
        />

        <BankDetailsBottomSheet
          ref={bankSheetRef}
          value={bankForm}
          onChange={setBankForm}
          onSave={() => {
            bankSheetRef.current?.dismiss();
            showToast({
              message: "Bank details update is not available yet.",
              type: "success",
            });
          }}
          bankOptions={bankOptions}
        />

        <FeedbackBottomSheet
          ref={feedbackSheetRef}
          value={feedbackForm}
          onChange={setFeedbackForm}
          onSubmit={() => {
            void handleSubmitFeedback();
          }}
          submitting={submitFeedbackMutation.isPending}
        />

        <AppScreenLoader visible={isMutating || (isFetching && !profile)} />
      </View>
    </SafeAreaView>
  );
}

const skeletonColor = "rgba(17,26,50,0.08)";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#EEF5DB" },
  screen: { flex: 1, backgroundColor: "#F7F7F2" },
  gradientBg: { ...StyleSheet.absoluteFill },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 18,
    backgroundColor: "transparent",
  },
  headerWrap: { marginBottom: 14 },
  sectionBlock: { gap: 12, marginTop: 18 },
  sectionTitle: {
    fontSize: 14,
    lineHeight: 18,
    color: "rgba(17,26,50,0.68)",
    fontFamily: Theme.fonts.body.semibold,
  },
  emptyState: {
    paddingHorizontal: 24,
    justifyContent: "center",
    gap: 14,
  },
  emptyTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontFamily: Theme.fonts.body.semibold,
    color: Theme.colors.text,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 22,
    color: Theme.colors.textMuted,
    textAlign: "center",
  },
  errorText: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    color: "#B42318",
    textAlign: "center",
  },
  skeletonHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 14,
  },
  skeletonAvatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: skeletonColor,
  },
  skeletonHeaderText: {
    flex: 1,
    gap: 7,
  },
  skeletonLineLarge: {
    width: "72%",
    height: 22,
    borderRadius: 999,
    backgroundColor: skeletonColor,
  },
  skeletonLineMedium: {
    width: "54%",
    height: 14,
    borderRadius: 999,
    backgroundColor: skeletonColor,
  },
  skeletonLineSmall: {
    width: "62%",
    height: 14,
    borderRadius: 999,
    backgroundColor: skeletonColor,
  },
  skeletonLineTiny: {
    width: "42%",
    height: 13,
    borderRadius: 999,
    backgroundColor: skeletonColor,
  },
  skeletonBanner: {
    height: 78,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.20)",
    backgroundColor: "rgba(255,255,255,0.46)",
    marginBottom: 18,
  },
  skeletonSectionTitle: {
    width: 112,
    height: 14,
    borderRadius: 999,
    backgroundColor: skeletonColor,
    marginTop: 8,
    marginBottom: 12,
  },
  skeletonCard: {
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.58)",
    borderWidth: 1,
    borderColor: "rgba(17,26,50,0.07)",
    overflow: "hidden",
    marginBottom: 14,
  },
  skeletonRow: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(17,26,50,0.06)",
  },
  skeletonRowIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: skeletonColor,
  },
  skeletonRowContent: {
    flex: 1,
    gap: 7,
  },
  skeletonRowLine: {
    width: "58%",
    height: 15,
    borderRadius: 999,
    backgroundColor: skeletonColor,
  },
  skeletonRowSubLine: {
    width: "74%",
    height: 12,
    borderRadius: 999,
    backgroundColor: skeletonColor,
  },
});