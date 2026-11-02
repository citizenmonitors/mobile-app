import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import AppGradientScreen from "@/components/app/AppGradientScreen";
import AppButton from "@/components/ui/AppButton";
import AppText from "@/components/ui/AppText";
import BackButton from "@/components/ui/BackButton";
import { useAppToast } from "@/hooks/useAppToast";
import {
  usePulseBlocksQuery,
  useUnblockPulseAuthorMutation,
} from "@/hooks/api/usePulseQueries";
import { formatPostDate } from "@/lib/formatPostDate";
import { PulseBlock } from "@/lib/api/pulse.api";
import { Theme } from "@/theme";

export { default as ErrorBoundary } from "@/components/app/RouteErrorFallback";

export default function BlockedUsersScreen() {
  const { showToast } = useAppToast();
  const blocksQuery = usePulseBlocksQuery();
  const unblockMutation = useUnblockPulseAuthorMutation();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const blocks = blocksQuery.data?.blocks ?? [];

  const unblock = (block: PulseBlock) => {
    Alert.alert(
      `Unblock ${block.displayName}?`,
      "You'll see each other's posts and comments in Pulse again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unblock",
          onPress: async () => {
            setPendingId(block.id);
            try {
              await unblockMutation.mutateAsync(block.id);
              showToast({
                type: "success",
                message: `${block.displayName} is unblocked.`,
              });
            } catch (error) {
              showToast({
                type: "error",
                message:
                  error instanceof Error ? error.message : "Unable to unblock.",
              });
            } finally {
              setPendingId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <AppGradientScreen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={blocksQuery.isRefetching}
            onRefresh={() => void blocksQuery.refetch()}
            tintColor={Theme.colors.primary}
            colors={[Theme.colors.primary]}
          />
        }
      >
        <BackButton />

        <View style={styles.headerBlock}>
          <AppText style={styles.screenTitle}>Blocked users</AppText>
          <AppText style={styles.screenSubtitle}>
            {"People you block can't see your Pulse posts or comments, and you won't see theirs."}
          </AppText>
        </View>

        {blocksQuery.isLoading ? (
          <ActivityIndicator color={Theme.colors.primary} style={styles.loader} />
        ) : blocksQuery.isError ? (
          <View style={styles.emptyWrap}>
            <AppText style={styles.emptyText}>
              {blocksQuery.error instanceof Error
                ? blocksQuery.error.message
                : "Unable to load blocked users."}
            </AppText>
            <AppButton
              title="Try again"
              variant="secondary"
              onPress={() => void blocksQuery.refetch()}
            />
          </View>
        ) : blocks.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="ban-outline" size={36} color={Theme.colors.textSoft} />
            <AppText style={styles.emptyTitle}>No blocked users</AppText>
            <AppText style={styles.emptyText}>
              You can block someone from the menu on their post or comment.
            </AppText>
          </View>
        ) : (
          <View style={styles.list}>
            {blocks.map((block, index) => (
              <View
                key={block.id}
                style={[styles.row, index === blocks.length - 1 && styles.rowLast]}
              >
                <View style={styles.rowText}>
                  <AppText style={styles.name} numberOfLines={1}>
                    {block.displayName}
                  </AppText>
                  <AppText style={styles.date}>
                    Blocked {formatPostDate(block.blockedAt)}
                  </AppText>
                </View>

                <Pressable
                  onPress={() => unblock(block)}
                  disabled={pendingId === block.id}
                  style={styles.unblockBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`Unblock ${block.displayName}`}
                >
                  {pendingId === block.id ? (
                    <ActivityIndicator size="small" color={Theme.colors.primary} />
                  ) : (
                    <AppText style={styles.unblockText}>Unblock</AppText>
                  )}
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </AppGradientScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 56,
    gap: 18,
  },
  headerBlock: { gap: 8, marginTop: 2 },
  screenTitle: {
    fontSize: 22,
    lineHeight: 28,
    color: Theme.colors.text,
    fontFamily: Theme.fonts.heading.bold,
  },
  screenSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: Theme.colors.textMuted,
  },
  loader: { marginTop: 40 },
  emptyWrap: { alignItems: "center", gap: 10, paddingTop: 40 },
  emptyTitle: {
    fontSize: 17,
    color: Theme.colors.text,
    fontFamily: Theme.fonts.body.semibold,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    color: Theme.colors.textMuted,
    textAlign: "center",
    maxWidth: 280,
  },
  list: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.colors.borderSoft,
    backgroundColor: Theme.colors.surface,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.borderSoft,
  },
  rowLast: { borderBottomWidth: 0 },
  rowText: { flex: 1, gap: 2 },
  name: {
    fontSize: 15,
    color: Theme.colors.text,
    fontFamily: Theme.fonts.body.semibold,
  },
  date: { fontSize: 12, color: Theme.colors.textMuted },
  unblockBtn: {
    minWidth: 88,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  unblockText: {
    fontSize: 13,
    color: Theme.colors.primary,
    fontFamily: Theme.fonts.body.semibold,
  },
});
