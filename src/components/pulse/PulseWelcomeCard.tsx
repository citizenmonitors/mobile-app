// Founder intro post, pinned at the top of the Pulse "All" feed for every
// user. Written by Ade Haastrup (Co-founder, Citizen Monitors). Styled like a
// regular post card so it reads as the first post, matching the web.

import { Ionicons } from "@expo/vector-icons";
import { memo, useState } from "react";
import { Image, Pressable, Share, StyleSheet, View } from "react-native";

import AppText from "@/components/ui/AppText";
import { Theme } from "@/theme";

const FOUNDER_PHOTO = require("../../../assets/images/pulse-welcome.png");

const POST_DATE = "Jul 2, 2026";
const COLLAPSED_LINES = 6;

const ARTICLE_BODY = `Hi, my name is Ade. I built Pulse for you. Not for politicians. Not for institutions. For the person on your street who has been watching things fall apart and wondering if anyone else sees it too. They do. And now you have somewhere to find each other.

This is your community, finally in one place. Real people, your neighbours, your streets, your shared frustrations, with somewhere useful to put it all.

Talk about the clinic with no drugs. The road that's been "under construction" since 2019. The extortion everyone experiences and nobody is officially reporting. The government announcement and what it actually means for your street. Governance isn't just elections; it's every broken thing in between.

And here's where it gets interesting. When enough people are saying the same thing, it stops being a complaint and becomes a pattern. A pattern becomes evidence. And evidence? Evidence travels; to the right desks, the right authorities, the right people who suddenly can't pretend they didn't know.

Your gist has power. Use it.

Post with your name or stay anonymous. Both work. Both matter.

The magic happens when your whole community is here. So don't come alone - bring your neighbours, your friends, the person on your street who notices everything. Every voice added makes this harder to ignore.

Your community has receipts. This is where you file them!`;

function PulseWelcomeCard() {
  const [expanded, setExpanded] = useState(false);

  const share = () => {
    void Share.share({
      message: `${ARTICLE_BODY.split("\n")[0]}\n\nhttps://www.citizenmonitors.com/pulse`,
    }).catch(() => undefined);
  };

  return (
    <View style={styles.card}>
      <View style={styles.pinnedRow}>
        <Ionicons name="pin" size={13} color={Theme.colors.textMuted} />
        <AppText style={styles.pinnedText}>Pinned</AppText>
      </View>

      <View style={styles.row}>
        <Image
          source={FOUNDER_PHOTO}
          style={styles.avatar}
          resizeMode="cover"
          accessibilityLabel="Ade Haastrup"
        />

        <View style={styles.content}>
          <View style={styles.metaRow}>
            <AppText style={styles.authorName} numberOfLines={1}>
              Ade
            </AppText>
            <Ionicons
              name="checkmark-circle"
              size={15}
              color={Theme.colors.primary}
              accessibilityLabel="Verified"
            />
            <AppText style={styles.metaText} numberOfLines={1}>
              · Co-founder · {POST_DATE}
            </AppText>
          </View>

          <AppText
            style={styles.body}
            numberOfLines={expanded ? undefined : COLLAPSED_LINES}
          >
            {ARTICLE_BODY}
          </AppText>

          <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={6}>
            <AppText style={styles.readMore}>
              {expanded ? "Show less" : "Read more"}
            </AppText>
          </Pressable>

          <View style={styles.actionsRow}>
            <Pressable
              onPress={share}
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

export default memo(PulseWelcomeCard);

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.borderSoft,
  },
  pinnedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 22,
  },
  pinnedText: {
    fontSize: 13,
    color: Theme.colors.textMuted,
    fontFamily: Theme.fonts.body.semibold,
  },
  row: { flexDirection: "row", gap: 12 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.colors.primarySoft,
  },
  content: { flex: 1, gap: 4 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
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
  actionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 10,
    paddingRight: 32,
  },
});
