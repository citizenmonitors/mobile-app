import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AppText from "@/components/ui/AppText";
import { formatPostDate } from "@/lib/formatPostDate";
import { POST_AUDIENCES } from "@/components/pulse/audiences";
import { useOfflineSync } from "@/context/OfflineSyncContext";
import { useAppToast } from "@/hooks/useAppToast";
import { PickedMedia, useCollationMedia } from "@/hooks/useCollationMedia";
import {
  pulseQueryKeys,
  useCreatePulsePostMutation,
  usePulseViewerQuery,
  useQuotePulsePostMutation,
  useRepostPulsePostMutation,
} from "@/hooks/api/usePulseQueries";
import { useGenerateAnonymousUsernameMutation } from "@/hooks/api/useProfileMutations";
import {
  CreatePulsePostPayload,
  PulseVisibilityScope,
} from "@/lib/api/pulse.api";
import { shouldQueueAfterError } from "@/lib/offlineSubmission";
import ProfileAvatar from "@/svgs/app/profile/ProfileAvatar";
import { Theme } from "@/theme";

export { default as ErrorBoundary } from "@/components/app/RouteErrorFallback";

const MAX_LENGTH = 5000;

type ComposeParams = {
  /** Set when quoting: the post being quoted, plus what to preview of it. */
  quoteId?: string;
  quoteAuthor?: string;
  quoteBody?: string;
  quoteImage?: string;
  quoteDate?: string;
};

/**
 * Full-screen X-style composer. Opened from the Pulse "+" button to write a
 * post, or from a post's repost button to repost it: with no comment it's a
 * plain repost; with a comment it's a repost with comment (a quote).
 */
export default function PulseComposeScreen() {
  const quote = useLocalSearchParams<ComposeParams>();
  const isQuote = Boolean(quote.quoteId);
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { showToast } = useAppToast();
  const { enqueue, isOnline } = useOfflineSync();
  const { pickImageFromGallery, busy } = useCollationMedia();

  const viewerQuery = usePulseViewerQuery();
  const createPostMutation = useCreatePulsePostMutation();
  const quotePostMutation = useQuotePulsePostMutation();
  const repostMutation = useRepostPulsePostMutation();
  const generateAnonymousMutation = useGenerateAnonymousUsernameMutation();
  const viewer = viewerQuery.data;

  const [body, setBody] = useState("");
  const [scope, setScope] = useState<PulseVisibilityScope>("all");
  const [showAudiences, setShowAudiences] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [image, setImage] = useState<PickedMedia | null>(null);

  const audience =
    POST_AUDIENCES.find((option) => option.key === scope) ?? POST_AUDIENCES[0];

  const isSubmitting =
    busy ||
    createPostMutation.isPending ||
    quotePostMutation.isPending ||
    repostMutation.isPending ||
    generateAnonymousMutation.isPending;
  const hasComment = body.trim().length > 0;
  // A repost's comment is optional, but an attached image needs text.
  const canSubmit =
    !isSubmitting &&
    (isQuote ? hasComment || !image : body.trim().length > 3);
  const isPlainRepost = isQuote && !hasComment && !image;
  const remaining = MAX_LENGTH - body.length;

  const close = () => {
    if (router.canGoBack()) router.back();
  };

  const attachImage = async () => {
    const result = await pickImageFromGallery();

    if (!result.ok) {
      showToast({ type: "error", message: result.error });
      return;
    }

    if (result.data) setImage(result.data);
  };

  // Anonymous posts need an anonymous username; create one on first use.
  const ensureAnonymousName = async () => {
    if (!anonymous || viewer?.anonymousUsername || !isOnline) return;

    try {
      await generateAnonymousMutation.mutateAsync();
      await queryClient.invalidateQueries({ queryKey: pulseQueryKeys.viewer });
    } catch {
      // Non-blocking. The server explains if it still can't post anonymously.
    }
  };

  const queueOffline = (payload: CreatePulsePostPayload) => {
    enqueue({ type: "pulse-create-post", payload });
    showToast({
      type: "success",
      message: "Post saved offline. It will sync automatically.",
    });
    close();
  };

  const submit = async () => {
    if (!canSubmit) return;

    await ensureAnonymousName();

    const payload: CreatePulsePostPayload = {
      body: body.trim(),
      visibilityScope: scope,
      useAnonymousDisplay: anonymous,
      imageUri: image?.uri ?? null,
    };

    if (!isOnline) {
      if (isQuote) {
        showToast({
          type: "error",
          message: "You're offline. Try reposting again when connected.",
        });
        return;
      }
      queueOffline(payload);
      return;
    }

    try {
      if (isPlainRepost && quote.quoteId) {
        await repostMutation.mutateAsync(quote.quoteId);
        showToast({ type: "success", message: "Reposted." });
        close();
        return;
      }

      const response =
        isQuote && quote.quoteId
          ? await quotePostMutation.mutateAsync({
              postId: quote.quoteId,
              payload,
            })
          : await createPostMutation.mutateAsync(payload);

      // The post still goes out if the image upload fails. Never resend it.
      showToast(
        response.warning
          ? { type: "error", message: response.warning }
          : {
              type: "success",
              message: isQuote ? "Reposted with your comment." : "Post shared.",
            },
      );
      close();
    } catch (error) {
      if (!isQuote && shouldQueueAfterError(error)) {
        queueOffline(payload);
        return;
      }

      showToast({
        type: "error",
        message:
          error instanceof Error ? error.message : "Unable to share post.",
      });
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ animation: "slide_from_bottom" }} />

      {/* Header: Cancel · Post */}
      <View style={styles.header}>
        <Pressable onPress={close} hitSlop={10} accessibilityRole="button">
          <AppText style={styles.cancel}>Cancel</AppText>
        </Pressable>

        <Pressable
          onPress={() => void submit()}
          disabled={!canSubmit}
          style={[styles.postBtn, !canSubmit && styles.postBtnDisabled]}
          accessibilityRole="button"
          accessibilityLabel={isQuote ? "Repost" : "Post"}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={Theme.colors.white} />
          ) : (
            <AppText style={styles.postText}>
              {isQuote ? "Repost" : "Post"}
            </AppText>
          )}
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.row}>
            <View style={styles.avatarWrap}>
              {viewer?.profileImageUrl && !anonymous ? (
                <Image
                  source={{ uri: viewer.profileImageUrl }}
                  style={styles.avatar}
                />
              ) : (
                <ProfileAvatar width={40} height={40} />
              )}
            </View>

            <View style={styles.main}>
              {/* Audience picker */}
              <Pressable
                onPress={() => setShowAudiences((v) => !v)}
                style={styles.audienceChip}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`Audience: ${audience.label}. Change audience`}
              >
                <AppText style={styles.audienceText}>{audience.label}</AppText>
                <Ionicons
                  name={showAudiences ? "chevron-up" : "chevron-down"}
                  size={14}
                  color={Theme.colors.primary}
                />
              </Pressable>

              {showAudiences ? (
                <View style={styles.audienceList}>
                  {POST_AUDIENCES.map((option, index) => {
                    const selected = option.key === scope;

                    return (
                      <Pressable
                        key={option.key}
                        onPress={() => {
                          setScope(option.key);
                          setShowAudiences(false);
                        }}
                        style={[
                          styles.audienceRow,
                          index === POST_AUDIENCES.length - 1 &&
                            styles.audienceRowLast,
                        ]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                      >
                        <View style={styles.audienceRowText}>
                          <AppText style={styles.audienceLabel}>
                            {option.label}
                          </AppText>
                          <AppText style={styles.audienceDescription}>
                            {option.description}
                          </AppText>
                        </View>
                        {selected ? (
                          <Ionicons
                            name="checkmark-circle"
                            size={20}
                            color={Theme.colors.primary}
                          />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              <TextInput
                value={body}
                onChangeText={setBody}
                placeholder={
                  isQuote ? "Add a comment (optional)" : "What's happening?"
                }
                placeholderTextColor={Theme.colors.placeholder}
                multiline
                // For a repost the comment is optional, so don't force the
                // keyboard open: the user can just tap Repost.
                autoFocus={!isQuote}
                maxLength={MAX_LENGTH}
                textAlignVertical="top"
                style={styles.input}
                accessibilityLabel="Write a Pulse post"
              />

              {image?.uri ? (
                <View>
                  <Image
                    source={{ uri: image.uri }}
                    style={[
                      styles.preview,
                      image.width && image.height
                        ? { aspectRatio: image.width / image.height }
                        : null,
                    ]}
                    resizeMode="cover"
                  />
                  <Pressable
                    onPress={() => setImage(null)}
                    style={styles.removePreview}
                    hitSlop={8}
                    accessibilityLabel="Remove image"
                  >
                    <Ionicons
                      name="close"
                      size={16}
                      color={Theme.colors.white}
                    />
                  </Pressable>
                </View>
              ) : null}

              {isQuote ? (
                <View style={styles.quoted}>
                  <View style={styles.quotedMeta}>
                    <AppText style={styles.quotedAuthor} numberOfLines={1}>
                      {quote.quoteAuthor || "Citizen"}
                    </AppText>
                    {quote.quoteDate ? (
                      <AppText style={styles.quotedDate} numberOfLines={1}>
                        · {formatPostDate(quote.quoteDate)}
                      </AppText>
                    ) : null}
                  </View>
                  {quote.quoteBody ? (
                    <AppText style={styles.quotedBody} numberOfLines={4}>
                      {quote.quoteBody}
                    </AppText>
                  ) : null}
                  {quote.quoteImage ? (
                    <Image
                      source={{ uri: quote.quoteImage }}
                      style={styles.quotedImage}
                      resizeMode="cover"
                    />
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        </ScrollView>

        {/* Bottom bar: image, anonymous, guidelines, counter */}
        <View
          style={[
            styles.bottomBar,
            { paddingBottom: Math.max(insets.bottom, 10) },
          ]}
        >
          <View style={styles.bottomRow}>
            <Pressable
              onPress={() => void attachImage()}
              style={styles.iconBtn}
              hitSlop={6}
              accessibilityLabel="Attach image"
            >
              <Ionicons
                name="image-outline"
                size={22}
                color={Theme.colors.primary}
              />
            </Pressable>

            <Pressable
              onPress={() => setAnonymous((v) => !v)}
              style={styles.anonRow}
              hitSlop={6}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: anonymous }}
              accessibilityLabel="Post anonymously"
            >
              <Ionicons
                name={anonymous ? "checkbox" : "square-outline"}
                size={18}
                color={anonymous ? Theme.colors.primary : Theme.colors.textSoft}
              />
              <AppText style={styles.anonText} numberOfLines={1}>
                Post anonymously
                {anonymous && viewer?.anonymousUsername ? (
                  <AppText style={styles.anonName}>
                    {` as @${viewer.anonymousUsername}`}
                  </AppText>
                ) : null}
              </AppText>
            </Pressable>

            {remaining <= 200 ? (
              <AppText
                style={[styles.counter, remaining <= 20 && styles.counterLow]}
              >
                {remaining}
              </AppText>
            ) : null}
          </View>

          <AppText style={styles.guidelines}>
            Be factual. Be respectful. Hate speech and incitement are not
            allowed.
          </AppText>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Theme.colors.surface },
  flex: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancel: {
    fontSize: 16,
    color: Theme.colors.text,
    fontFamily: Theme.fonts.body.medium,
  },
  postBtn: {
    minWidth: 72,
    height: 36,
    paddingHorizontal: 18,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.colors.primary,
  },
  postBtnDisabled: { opacity: 0.5 },
  postText: {
    fontSize: 15,
    color: Theme.colors.white,
    fontFamily: Theme.fonts.body.bold,
  },

  content: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 24 },
  row: { flexDirection: "row", gap: 12 },
  avatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: Theme.colors.primarySoft,
  },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  main: { flex: 1, gap: 10 },

  audienceChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.colors.primary,
  },
  audienceText: {
    fontSize: 13,
    color: Theme.colors.primary,
    fontFamily: Theme.fonts.body.semibold,
  },
  audienceList: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.colors.borderSoft,
    overflow: "hidden",
  },
  audienceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.borderSoft,
  },
  audienceRowLast: { borderBottomWidth: 0 },
  audienceRowText: { flex: 1, gap: 1 },
  audienceLabel: {
    fontSize: 14,
    color: Theme.colors.text,
    fontFamily: Theme.fonts.body.semibold,
  },
  audienceDescription: { fontSize: 12, color: Theme.colors.textMuted },

  input: {
    minHeight: 120,
    paddingTop: 4,
    fontSize: 18,
    lineHeight: 26,
    color: Theme.colors.text,
    fontFamily: Theme.fonts.body.regular,
  },

  preview: {
    width: "100%",
    height: 220,
    borderRadius: 16,
    backgroundColor: "#EEF2F6",
  },
  quoted: {
    padding: 12,
    gap: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  quotedMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  quotedAuthor: {
    flexShrink: 1,
    fontSize: 14,
    color: Theme.colors.text,
    fontFamily: Theme.fonts.body.bold,
  },
  quotedDate: { fontSize: 13, color: Theme.colors.textMuted },
  quotedBody: { fontSize: 14, lineHeight: 20, color: Theme.colors.text },
  quotedImage: {
    width: "100%",
    height: 140,
    marginTop: 6,
    borderRadius: 12,
    backgroundColor: "#EEF2F6",
  },
  removePreview: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,26,50,0.7)",
  },

  bottomBar: {
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: Theme.colors.borderSoft,
    backgroundColor: Theme.colors.surface,
  },
  bottomRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  anonRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  anonText: {
    flexShrink: 1,
    fontSize: 13,
    color: Theme.colors.textMuted,
    fontFamily: Theme.fonts.body.medium,
  },
  anonName: {
    color: Theme.colors.primary,
    fontFamily: Theme.fonts.body.semibold,
  },
  counter: { fontSize: 12, color: Theme.colors.textMuted },
  counterLow: { color: Theme.colors.danger },
  guidelines: {
    paddingHorizontal: 4,
    fontSize: 11,
    lineHeight: 15,
    color: Theme.colors.textSoft,
  },
});
