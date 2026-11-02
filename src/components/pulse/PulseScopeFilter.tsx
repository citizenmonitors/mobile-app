import { Pressable, StyleSheet, View } from "react-native";

import AppText from "@/components/ui/AppText";
import { PulseFeedScope } from "@/lib/api/pulse.api";
import { Theme } from "@/theme";

type Props = {
  value: PulseFeedScope;
  onChange: (scope: PulseFeedScope) => void;
};

export const PULSE_SCOPE_OPTIONS: { key: PulseFeedScope; label: string }[] = [
  { key: "all", label: "All" },
  { key: "state", label: "State" },
  { key: "lga", label: "LGA" },
  { key: "ward", label: "Ward" },
  { key: "polling-unit", label: "Polling Unit" },
];

/** X-style underlined tab bar for the Pulse feed location filter. */
export default function PulseScopeFilter({ value, onChange }: Props) {
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {PULSE_SCOPE_OPTIONS.map((option) => {
        const active = option.key === value;

        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            style={styles.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <AppText
              style={[styles.label, active && styles.labelActive]}
              numberOfLines={1}
            >
              {option.label}
            </AppText>
            <View
              style={[styles.indicator, active && styles.indicatorActive]}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.borderSoft,
  },
  // Tabs size to their labels and share the leftover width, so a longer
  // label like "Polling Unit" never gets cut off on narrow phones.
  tab: {
    flexGrow: 1,
    flexShrink: 0,
    alignItems: "center",
    paddingTop: 14,
    paddingHorizontal: 6,
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    color: Theme.colors.textMuted,
    fontFamily: Theme.fonts.body.semibold,
  },
  labelActive: {
    color: Theme.colors.text,
    fontFamily: Theme.fonts.body.bold,
  },
  indicator: {
    marginTop: 12,
    height: 3,
    width: 44,
    borderRadius: 999,
    backgroundColor: "transparent",
  },
  indicatorActive: {
    backgroundColor: Theme.colors.primary,
  },
});
