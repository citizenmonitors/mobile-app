import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Image, Keyboard, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AppButton from "@/components/ui/AppButton";
import AppText from "@/components/ui/AppText";
import { POST_AUDIENCES } from "@/components/pulse/audiences";
import { useAppToast } from "@/hooks/useAppToast";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import { useUpdatePulsePostMutation } from "@/hooks/api/usePulseQueries";
import {
  PulseVisibilityScope,
  UpdatePulsePostPayload,
} from "@/lib/api/pulse.api";
import { Theme } from "@/theme";

const MAX_LENGTH = 5000;

export type PulseEditTarget = {
  id: string;
  body: string;
  imageUri?: string;
  visibilityScope: PulseVisibilityScope;
};

export type PulseEditPostSheetHandle = {
  present: (post: PulseEditTarget) => void;
};

const PulseEditPostSheet = forwardRef<PulseEditPostSheetHandle>(
  function PulseEditPostSheet(_props, ref) {
    const insets = useSafeAreaInsets();
    const sheetRef = useRef<BottomSheetModal>(null);
    const { handleSheetChange } = useBottomSheetBackHandler(sheetRef);
    const { showToast } = useAppToast();
    const updateMutation = useUpdatePulsePostMutation();
    const snapPoints = useMemo(() => ["88%"], []);

    const [post, setPost] = useState<PulseEditTarget | null>(null);
    const [body, setBody] = useState("");
    const [scope, setScope] = useState<PulseVisibilityScope>("all");
    const [removeImage, setRemoveImage] = useState(false);

    useImperativeHandle(ref, () => ({
      present: (target) => {
        setPost(target);
        setBody(target.body);
        setScope(target.visibilityScope);
        setRemoveImage(false);
        requestAnimationFrame(() => sheetRef.current?.present());
      },
    }));

    const close = () => {
      Keyboard.dismiss();
      sheetRef.current?.dismiss();
    };

    const changes: UpdatePulsePostPayload = {};
    if (post && body.trim() !== post.body.trim()) changes.body = body.trim();
    if (post && scope !== post.visibilityScope) changes.visibilityScope = scope;
    if (removeImage) changes.removeImage = true;

    const hasChanges = Object.keys(changes).length > 0;
    const canSave =
      hasChanges && body.trim().length > 0 && !updateMutation.isPending;

    const save = async () => {
      if (!post || !canSave) return;

      try {
        await updateMutation.mutateAsync({ postId: post.id, payload: changes });
        close();
        showToast({ type: "success", message: "Post updated." });
      } catch (error) {
        showToast({
          type: "error",
          message:
            error instanceof Error ? error.message : "Unable to update post.",
        });
      }
    };

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose
        topInset={insets.top + 12}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        onChange={handleSheetChange}
        backdropComponent={(p) => (
          <BottomSheetBackdrop
            {...p}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            opacity={0.3}
            pressBehavior="close"
          />
        )}
        handleIndicatorStyle={styles.handle}
        backgroundStyle={styles.bg}
      >
        <BottomSheetScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 28 },
          ]}
        >
          <View style={styles.header}>
            <AppText style={styles.title}>Edit post</AppText>
            <Pressable onPress={close} hitSlop={8} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={Theme.colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.inputWrap}>
            <BottomSheetTextInput
              value={body}
              onChangeText={setBody}
              multiline
              maxLength={MAX_LENGTH}
              textAlignVertical="top"
              placeholder="What's happening?"
              placeholderTextColor={Theme.colors.placeholder}
              style={styles.input}
            />
          </View>

          {post?.imageUri && !removeImage ? (
            <View>
              <Image source={{ uri: post.imageUri }} style={styles.image} />
              <Pressable
                onPress={() => setRemoveImage(true)}
                style={styles.removeImage}
                accessibilityLabel="Remove image"
              >
                <Ionicons
                  name="trash-outline"
                  size={14}
                  color={Theme.colors.white}
                />
                <AppText style={styles.removeImageText}>Remove</AppText>
              </Pressable>
            </View>
          ) : null}

          {removeImage ? (
            <Pressable onPress={() => setRemoveImage(false)} hitSlop={6}>
              <AppText style={styles.undoRemove}>
                Image will be removed · Undo
              </AppText>
            </Pressable>
          ) : null}

          <AppText style={styles.label}>Who can see this post?</AppText>
          <View style={styles.audienceRow}>
            {POST_AUDIENCES.map((option) => {
              const active = option.key === scope;

              return (
                <Pressable
                  key={option.key}
                  onPress={() => setScope(option.key)}
                  style={[
                    styles.audienceChip,
                    active && styles.audienceChipActive,
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <AppText
                    style={[
                      styles.audienceText,
                      active && styles.audienceTextActive,
                    ]}
                  >
                    {option.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          <AppButton
            title={updateMutation.isPending ? "Saving..." : "Save changes"}
            onPress={() => void save()}
            disabled={!canSave}
          />
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);

export default PulseEditPostSheet;

const styles = StyleSheet.create({
  bg: { backgroundColor: Theme.colors.surface, borderRadius: 24 },
  handle: { backgroundColor: "#D1D5DB", width: 40 },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 14 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 18,
    color: Theme.colors.text,
    fontFamily: Theme.fonts.body.semibold,
  },
  inputWrap: {
    minHeight: 140,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    padding: 12,
  },
  input: {
    minHeight: 116,
    fontSize: 16,
    lineHeight: 22,
    color: Theme.colors.text,
    fontFamily: Theme.fonts.body.regular,
  },
  image: {
    width: "100%",
    height: 200,
    borderRadius: 16,
    backgroundColor: "#EEF2F6",
  },
  removeImage: {
    position: "absolute",
    top: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(17,26,50,0.7)",
  },
  removeImageText: {
    fontSize: 12,
    color: Theme.colors.white,
    fontFamily: Theme.fonts.body.semibold,
  },
  undoRemove: {
    fontSize: 13,
    color: Theme.colors.primary,
    fontFamily: Theme.fonts.body.medium,
  },
  label: {
    fontSize: 14,
    color: Theme.colors.text,
    fontFamily: Theme.fonts.body.semibold,
  },
  audienceRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  audienceChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  audienceChipActive: {
    borderColor: Theme.colors.primary,
    backgroundColor: Theme.colors.primarySoft,
  },
  audienceText: { fontSize: 13, color: Theme.colors.textMuted },
  audienceTextActive: {
    color: Theme.colors.primary,
    fontFamily: Theme.fonts.body.semibold,
  },
});
