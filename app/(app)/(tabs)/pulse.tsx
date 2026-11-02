import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";

import AppGradientScreen from "@/components/app/AppGradientScreen";
import ScreenHeader from "@/components/elections/ScreenHeader";
import AppText from "@/components/ui/AppText";
import FloatingActionButton from "@/components/ui/FloatingActionButton";
import PulseForYouTab from "@/components/pulse/PulseForYouTab";
import { Paths } from "@/constants/paths";
import { Theme } from "@/theme";

export { default as ErrorBoundary } from "@/components/app/RouteErrorFallback";

export default function PulseScreen() {
  // Shared links look like citizenmonitors.com/pulse?post=<id>: open that post.
  const { post } = useLocalSearchParams<{ post?: string }>();
  const openedPostRef = useRef<string | null>(null);

  useEffect(() => {
    if (post && openedPostRef.current !== post) {
      openedPostRef.current = post;
      router.push(Paths.appPulsePost(post));
    }
  }, [post]);

  return (
    <AppGradientScreen scroll={false}>
      <View style={styles.container}>
        <View style={styles.topSection}>
          <ScreenHeader
            title="Pulse"
            onNotifications={() => router.push(Paths.appNotifications)}
            onHelp={() => router.push(Paths.appHelpSupport)}
          />

          <AppText style={styles.subtitle}>
            Community updates from citizens across Nigeria
          </AppText>
        </View>

        <View style={styles.body}>
          <PulseForYouTab />
        </View>

        {/* X-style compose button: opens the full-screen composer. */}
        <FloatingActionButton
          collapsed
          label="Post"
          accessibilityLabel="Create a post"
          icon={<Ionicons name="add" size={28} color={Theme.colors.white} />}
          onPress={() => router.push(Paths.appPulseCompose)}
        />
      </View>
    </AppGradientScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 10,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: Theme.colors.textMuted,
  },
  body: {
    flex: 1,
    backgroundColor: Theme.colors.surface,
    marginTop: 10,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
  },
});
