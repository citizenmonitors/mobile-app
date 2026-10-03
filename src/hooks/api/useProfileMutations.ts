import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  deleteMyAccount,
  generateAnonymousUsername,
  MobileNotificationSettingsState,
  submitFeedback,
  SubmitFeedbackPayload,
  updateAnonymousIdentity,
  UpdateAnonymousIdentityPayload,
  updateMyProfile,
  UpdatePasswordPayload,
  updateNotificationSettings,
  updatePassword,
  UpdateProfilePayload,
  upgradePublicViewerToVolunteer,
  upgradeVolunteerToObserver,
  UpgradeVolunteerToObserverPayload,
} from "@/lib/api/profile.api";

function invalidateProfileQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["profile", "me"] });
  void queryClient.invalidateQueries({ queryKey: ["my-profile"] });
}

export function useUpdateMyProfileMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateProfilePayload) => updateMyProfile(payload),
    onSuccess: () => {
      invalidateProfileQueries(queryClient);
    },
  });
}

export function useUpdatePasswordMutation() {
  return useMutation({
    mutationFn: (payload: UpdatePasswordPayload) => updatePassword(payload),
  });
}

export function useUpdateNotificationSettingsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: MobileNotificationSettingsState) =>
      updateNotificationSettings(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["profile", "notifications"],
      });
      invalidateProfileQueries(queryClient);
    },
  });
}

export function useGenerateAnonymousUsernameMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: generateAnonymousUsername,
    onSuccess: () => {
      invalidateProfileQueries(queryClient);
    },
  });
}

export function useUpdateAnonymousIdentityMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateAnonymousIdentityPayload) =>
      updateAnonymousIdentity(payload),
    onSuccess: () => {
      invalidateProfileQueries(queryClient);
    },
  });
}

export function useSubmitFeedbackMutation() {
  return useMutation({
    mutationFn: (payload: SubmitFeedbackPayload) => submitFeedback(payload),
  });
}

export function useUpgradePublicViewerToVolunteerMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: upgradePublicViewerToVolunteer,
    onSuccess: () => {
      invalidateProfileQueries(queryClient);
    },
  });
}

export function useUpgradeVolunteerToObserverMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpgradeVolunteerToObserverPayload) =>
      upgradeVolunteerToObserver(payload),
    onSuccess: () => {
      invalidateProfileQueries(queryClient);
    },
  });
}

export function useDeleteMyAccountMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteMyAccount,
    onSuccess: () => {
      queryClient.clear();
    },
  });
}