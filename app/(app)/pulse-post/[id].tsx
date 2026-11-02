import { useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import PulseForYouTab from "@/components/pulse/PulseForYouTab";
import AppText from "@/components/ui/AppText";
import BackButton from "@/components/ui/BackButton";
import { Theme } from "@/theme";

export { default as ErrorBoundary } from "@/components/app/RouteErrorFallback";

/** One Pulse post: opened from a shared link, a tapped quote or a notification. */
export default function PulsePostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackButton />
        <AppText style={styles.title}>Post</AppText>
      </View>

      <View style={styles.body}>
        {id ? <PulseForYouTab postId={id} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Theme.colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.borderSoft,
  },
  title: {
    fontSize: 18,
    color: Theme.colors.text,
    fontFamily: Theme.fonts.heading.bold,
  },
  body: { flex: 1 },
});
