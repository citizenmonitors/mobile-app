import { Image, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { memo, useEffect, useState } from "react";

import AppText from "@/components/ui/AppText";
import { formatPostDate } from "@/lib/formatPostDate";
import { PulseDiscussionPost, PulseQuotedPost } from "@/data/pulse";
import { Theme } from "@/theme";
import ProfileAvatar from "@/svgs/app/profile/ProfileAvatar";

const COLLAPSED_LINES = 6;
/** Liked-heart colour, as on X. */
export const LIKE_COLOR = "#F91880";
const COLLAPSE_MIN_CHARS = 280;

/** Renders a post image at its natural aspect ratio (portrait/landscape/square). */
function PostImage({ uri }: { uri: string }) {
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  // Hide the image if it can't be loaded, instead of leaving an empty box.
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    Image.getSize(
      uri,
      (w, h) => setAspectRatio(w > 0 && h > 0 ? w / h : 16 / 9),
      () => setFailed(true),
    );
  }, [uri]);

  if (failed) return null;

  return (
    <Image
      source={{ uri }}
      style={[styles.postImage, { aspectRatio: aspectRatio ?? 16 / 9 }]}
      resizeMode="cover"
      onError={() => setFailed(true)}
      accessibilityLabel="Post attachment"
    />
  );
}

/** The post a quote points at, shown in a bordered box under the quote. */
function QuotedPost({
  quoted,
  onPress,
}: {
  quoted: PulseQuotedPost;
  onPress?: () => void;
}) {
  if (quoted.unavailable) {
    return (
      <View style={styles.unavailable}>
        <AppText style={styles.unavailableText}>
          This post is unavailable
        </AppText>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={styles.quoted}
      accessibilityRole="button"
      accessibilityLabel="Open quoted post"
    >
      <View style={styles.quotedMeta}>
        <View style={styles.quotedAvatarWrap}>
          {quoted.avatarUri ? (
            <Image
              source={{ uri: quoted.avatarUri }}
              style={styles.quotedAvatar}
            />
          ) : (
            <ProfileAvatar width={20} height={20} />
          )}
        </View>
        <AppText style={styles.quotedAuthor} numberOfLines={1}>
          {quoted.author ?? "Citizen"}
        </AppText>
        {quoted.createdAt ? (
          <AppText style={styles.quotedDate} numberOfLines={1}>
            · {formatPostDate(quoted.createdAt)}
          </AppText>
        ) : null}
      </View>
      {quoted.body ? (
        <AppText style={styles.quotedBody} numberOfLines={4}>
          {quoted.body}
        </AppText>
      ) : null}
      {quoted.imageUri ? (
        <PostImage key={quoted.imageUri} uri={quoted.imageUri} />
      ) : null}
    </Pressable>
  );
}

function shouldCollapse(body: string): boolean {
  return (
    body.length > COLLAPSE_MIN_CHARS ||
    body.split("\n").length > COLLAPSED_LINES
  );
}

type Props = {
  post: PulseDiscussionPost;
  isLiked: boolean;
  displayLikes: number;
  /** The current user has reposted this content. */
  isReposted: boolean;
  /** False only while the post is still waiting to sync. */
  canRepost: boolean;
  /** Set when the current user is the one who reposted this card. */
  repostedByMe?: boolean;
  pendingSync?: boolean;
  onLike: () => void;
  onComment: () => void;
  onRepost: () => void;
  onShare: () => void;
  onMore: () => void;
  /** Opens the quoted post on its own screen. */
  onOpenQuoted?: (postId: string) => void;
};

function PulseDiscussionCard({
  post,
  isLiked,
  displayLikes,
  isReposted,
  canRepost,
  repostedByMe = false,
  pendingSync = false,
  onLike,
  onComment,
  onRepost,
  onShare,
  onMore,
  onOpenQuoted,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const collapsible = shouldCollapse(post.body);
  const date = pendingSync ? "Sending…" : formatPostDate(post.createdAt);

  return (
    <View style={[styles.card, pendingSync && styles.cardPending]}>
      {post.isRepost ? (
        <View style={styles.repostHeader}>
          <Ionicons name="repeat" size={15} color={Theme.colors.textMuted} />
          <AppText style={styles.repostHeaderText} numberOfLines={1}>
            {repostedByMe
              ? "You reposted"
              : `${post.repostedBy ?? "Someone"} reposted`}
          </AppText>
        </View>
      ) : null}

      <View style={styles.cardRow}>
        <View style={styles.avatarWrap}>
          {post.avatarUri ? (
            <Image source={{ uri: post.avatarUri }} style={styles.avatar} />
          ) : (
            <ProfileAvatar width={40} height={40} />
          )}
        </View>

        <View style={styles.content}>
          {/* Name · @handle · date */}
          <View style={styles.headerRow}>
            <View style={styles.metaRow}>
              <AppText style={styles.authorName} numberOfLines={1}>
                {post.author}
              </AppText>

              <AppText style={styles.metaText} numberOfLines={1}>
                · {date}
                {post.isEdited && !pendingSync ? " · Edited" : ""}
              </AppText>
            </View>

            {!pendingSync ? (
              <Pressable
                onPress={onMore}
                hitSlop={10}
                style={styles.moreBtn}
                accessibilityLabel="More options"
              >
                <Ionicons
                  name="ellipsis-horizontal"
                  size={18}
                  color={Theme.colors.textSoft}
                />
              </Pressable>
            ) : null}
          </View>

          {post.originalUnavailable ? (
            <View style={styles.unavailable}>
              <AppText style={styles.unavailableText}>
                This post is unavailable
              </AppText>
            </View>
          ) : null}

          {/* Body */}
          {post.body ? (
            <AppText
              style={styles.body}
              numberOfLines={
                collapsible && !expanded ? COLLAPSED_LINES : undefined
              }
            >
              {post.body}
            </AppText>
          ) : null}

          {collapsible ? (
            <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={6}>
              <AppText style={styles.readMore}>
                {expanded ? "Show less" : "Read more"}
              </AppText>
            </Pressable>
          ) : null}

          {post.imageUri ? (
            <PostImage key={post.imageUri} uri={post.imageUri} />
          ) : null}

          {post.quoted ? (
            <QuotedPost
              quoted={post.quoted}
              onPress={
                onOpenQuoted && !post.quoted.unavailable
                  ? () => onOpenQuoted(post.quoted!.id)
                  : undefined
              }
            />
          ) : null}

          {/* Actions */}
          <View style={styles.actionsRow}>
            <Pressable
              onPress={onComment}
              style={styles.actionItem}
              hitSlop={8}
              accessibilityLabel={`Comments, ${post.commentCount}`}
            >
              <Ionicons
                name="chatbubble-outline"
                size={18}
                color={Theme.colors.textMuted}
              />
              {post.commentCount > 0 ? (
                <AppText style={styles.actionText}>{post.commentCount}</AppText>
              ) : null}
            </Pressable>

            {canRepost ? (
              <Pressable
                onPress={onRepost}
                style={styles.actionItem}
                hitSlop={8}
                accessibilityLabel={
                  isReposted ? "Undo repost" : `Repost, ${post.repostCount}`
                }
                accessibilityState={{ selected: isReposted }}
              >
                <Ionicons
                  name="repeat"
                  size={20}
                  color={
                    isReposted ? Theme.colors.success : Theme.colors.textMuted
                  }
                />
                {post.repostCount > 0 ? (
                  <AppText
                    style={[
                      styles.actionText,
                      isReposted && styles.actionTextReposted,
                    ]}
                  >
                    {post.repostCount}
                  </AppText>
                ) : null}
              </Pressable>
            ) : (
              <View style={styles.actionItem} />
            )}

            <Pressable
              onPress={onLike}
              style={styles.actionItem}
              hitSlop={8}
              accessibilityLabel={`Like, ${displayLikes}`}
              accessibilityState={{ selected: isLiked }}
            >
              <Ionicons
                name={isLiked ? "heart" : "heart-outline"}
                size={19}
                color={isLiked ? LIKE_COLOR : Theme.colors.textMuted}
              />
              {displayLikes > 0 ? (
                <AppText
                  style={[
                    styles.actionText,
                    isLiked && styles.actionTextActive,
                  ]}
                >
                  {displayLikes}
                </AppText>
              ) : null}
            </Pressable>

            <Pressable
              onPress={onShare}
              style={styles.actionItem}
              hitSlop={8}
              accessibilityLabel="Share post"
            >
              <Ionicons
                name="share-social-outline"
                size={18}
                color={Theme.colors.textMuted}
              />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

export default memo(PulseDiscussionCard);

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.borderSoft,
    gap: 6,
  },
  cardRow: { flexDirection: "row", gap: 12 },
  repostHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 22,
  },
  repostHeaderText: {
    flexShrink: 1,
    fontSize: 13,
    color: Theme.colors.textMuted,
    fontFamily: Theme.fonts.body.semibold,
  },
  cardPending: { opacity: 0.6 },

  avatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: Theme.colors.primarySoft,
  },
  avatar: { width: 40, height: 40, borderRadius: 20 },

  content: { flex: 1, gap: 4 },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metaRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  authorName: {
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 20,
    color: Theme.colors.text,
    fontFamily: Theme.fonts.body.bold,
  },
  metaText: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 20,
    color: Theme.colors.textMuted,
  },
  moreBtn: { paddingLeft: 4 },

  body: {
    marginTop: 4,
    fontSize: 15,
    lineHeight: 22,
    color: Theme.colors.text,
  },
  readMore: {
    fontSize: 14,
    lineHeight: 20,
    color: Theme.colors.primary,
    fontFamily: Theme.fonts.body.semibold,
  },

  quoted: {
    marginTop: 8,
    padding: 12,
    gap: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  quotedMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  quotedAvatarWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    overflow: "hidden",
    marginRight: 2,
    backgroundColor: Theme.colors.primarySoft,
  },
  quotedAvatar: { width: 20, height: 20, borderRadius: 10 },
  quotedAuthor: {
    flexShrink: 1,
    fontSize: 14,
    color: Theme.colors.text,
    fontFamily: Theme.fonts.body.bold,
  },
  quotedDate: { fontSize: 13, color: Theme.colors.textMuted },
  quotedBody: { fontSize: 14, lineHeight: 20, color: Theme.colors.text },
  unavailable: {
    marginTop: 8,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.colors.borderSoft,
    backgroundColor: Theme.colors.surfaceSoft,
  },
  unavailableText: { fontSize: 14, color: Theme.colors.textMuted },
  postImage: {
    width: "100%",
    marginTop: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.colors.borderSoft,
    backgroundColor: "#EEF2F6",
  },

  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    paddingRight: 32,
  },
  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 48,
  },
  actionText: { fontSize: 13, lineHeight: 16, color: Theme.colors.textMuted },
  actionTextActive: { color: LIKE_COLOR },
  actionTextReposted: { color: Theme.colors.success },
});
