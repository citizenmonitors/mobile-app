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
import { Alert, Keyboard, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AppButton from "@/components/ui/AppButton";
import AppText from "@/components/ui/AppText";
import { useAppToast } from "@/hooks/useAppToast";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import {
  useBlockPulseAuthorMutation,
  useReportPulseContentMutation,
} from "@/hooks/api/usePulseQueries";
import { PulseReportReason } from "@/lib/api/pulse.api";
import { Theme } from "@/theme";

const REASONS: { key: PulseReportReason; label: string }[] = [
  { key: "spam", label: "Spam or scam" },
  { key: "harassment", label: "Harassment or bullying" },
  { key: "hate", label: "Hate speech" },
  { key: "violence", label: "Violence or threats" },
  { key: "sexual", label: "Sexual content" },
  { key: "misinformation", label: "False information" },
  { key: "other", label: "Something else" },
];

const MAX_DETAILS = 1000;

export type PulseReportSheetTarget = {
  postId: string;
  /** Set when reporting a comment on `postId`. */
  commentId?: string;
  /** On reposts: the original post, which is what actually gets reported. */
  originalPostId?: string;
  /** Name shown on the content, for the "Block …?" prompt. */
  authorName: string;
};

export type PulseReportSheetHandle = {
  present: (target: PulseReportSheetTarget) => void;
};

/** Report a post or comment, then offer to block its author. */
const PulseReportSheet = forwardRef<PulseReportSheetHandle>(
  function PulseReportSheet(_props, ref) {
    const insets = useSafeAreaInsets();
    const sheetRef = useRef<BottomSheetModal>(null);
    const { handleSheetChange } = useBottomSheetBackHandler(sheetRef);
    const { showToast } = useAppToast();
    const reportMutation = useReportPulseContentMutation();
    const blockMutation = useBlockPulseAuthorMutation();
    const snapPoints = useMemo(() => ["88%"], []);

    const [target, setTarget] = useState<PulseReportSheetTarget | null>(null);
    const [reason, setReason] = useState<PulseReportReason | null>(null);
    const [details, setDetails] = useState("");

    useImperativeHandle(ref, () => ({
      present: (next) => {
        setTarget(next);
        setReason(null);
        setDetails("");
        requestAnimationFrame(() => sheetRef.current?.present());
      },
    }));

    const close = () => {
      Keyboard.dismiss();
      sheetRef.current?.dismiss();
    };

    const block = async (reported: PulseReportSheetTarget) => {
      try {
        // Blocks are made from content; for reposts, the original's author.
        await blockMutation.mutateAsync(
          reported.commentId
            ? { commentId: reported.commentId }
            : { postId: reported.originalPostId ?? reported.postId },
        );
        showToast({
          type: "success",
          message: `${reported.authorName} is blocked.`,
        });
      } catch (error) {
        showToast({
          type: "error",
          message: error instanceof Error ? error.message : "Unable to block.",
        });
      }
    };

    const submit = async () => {
      if (!target || !reason) return;

      try {
        await reportMutation.mutateAsync({
          postId: target.postId,
          commentId: target.commentId,
          originalPostId: target.originalPostId,
          reason,
          details,
        });
        close();

        const reported = target;
        Alert.alert(
          "Thanks for reporting",
          `Our team will review it. Do you also want to block ${reported.authorName}? You won't see each other's posts or comments.`,
          [
            { text: "Not now", style: "cancel" },
            {
              text: "Block",
              style: "destructive",
              onPress: () => void block(reported),
            },
          ],
        );
      } catch (error) {
        showToast({
          type: "error",
          message:
            error instanceof Error ? error.message : "Unable to send report.",
        });
      }
    };

    const kind = target?.commentId ? "comment" : "post";

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
            <AppText style={styles.title}>Report {kind}</AppText>
            <Pressable onPress={close} hitSlop={8} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={Theme.colors.textMuted} />
            </Pressable>
          </View>

          <AppText style={styles.subtitle}>
            Why are you reporting this {kind}? It will be hidden for you, and
            our team will review it.
          </AppText>

          <View style={styles.group}>
            {REASONS.map((item, index) => {
              const selected = item.key === reason;

              return (
                <Pressable
                  key={item.key}
                  onPress={() => setReason(item.key)}
                  style={[
                    styles.reasonRow,
                    index === REASONS.length - 1 && styles.reasonRowLast,
                    selected && styles.reasonRowActive,
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <AppText style={styles.reasonLabel}>{item.label}</AppText>
                  <Ionicons
                    name={selected ? "radio-button-on" : "radio-button-off"}
                    size={20}
                    color={
                      selected ? Theme.colors.primary : Theme.colors.textSoft
                    }
                  />
                </Pressable>
              );
            })}
          </View>

          <View style={styles.detailsWrap}>
            <BottomSheetTextInput
              value={details}
              onChangeText={setDetails}
              placeholder="Add details (optional)"
              placeholderTextColor={Theme.colors.placeholder}
              multiline
              maxLength={MAX_DETAILS}
              textAlignVertical="top"
              style={styles.details}
            />
          </View>

          <AppButton
            title={reportMutation.isPending ? "Sending..." : "Submit report"}
            onPress={() => void submit()}
            disabled={!reason || reportMutation.isPending}
          />
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);

export default PulseReportSheet;

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
  subtitle: { fontSize: 13, lineHeight: 18, color: Theme.colors.textMuted },
  group: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.colors.borderSoft,
    overflow: "hidden",
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 50,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.borderSoft,
  },
  reasonRowLast: { borderBottomWidth: 0 },
  reasonRowActive: { backgroundColor: "rgba(5,163,156,0.06)" },
  reasonLabel: { fontSize: 14, color: Theme.colors.text },
  detailsWrap: {
    minHeight: 96,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    padding: 12,
  },
  details: {
    minHeight: 72,
    fontSize: 14,
    lineHeight: 20,
    color: Theme.colors.text,
    fontFamily: Theme.fonts.body.regular,
  },
});
