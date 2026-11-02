import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AppText from "@/components/ui/AppText";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import { Theme } from "@/theme";

export type PulseAction = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  danger?: boolean;
  onPress: () => void;
};

export type PulseActionSheetHandle = {
  present: (actions: PulseAction[]) => void;
};

/** "…" menu used on Pulse posts and comments. */
const PulseActionSheet = forwardRef<PulseActionSheetHandle>(
  function PulseActionSheet(_props, ref) {
    const insets = useSafeAreaInsets();
    const sheetRef = useRef<BottomSheetModal>(null);
    const { handleSheetChange } = useBottomSheetBackHandler(sheetRef);
    const [actions, setActions] = useState<PulseAction[]>([]);

    useImperativeHandle(ref, () => ({
      present: (next) => {
        setActions(next);
        requestAnimationFrame(() => sheetRef.current?.present());
      },
    }));

    const run = (action: PulseAction) => {
      sheetRef.current?.dismiss();
      // Let the sheet start closing before the action opens anything else.
      setTimeout(action.onPress, 150);
    };

    return (
      <BottomSheetModal
        ref={sheetRef}
        enableDynamicSizing
        enablePanDownToClose
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
        <BottomSheetView
          style={[styles.container, { paddingBottom: insets.bottom + 20 }]}
        >
          <View style={styles.group}>
            {actions.map((action) => {
              const color = action.danger
                ? Theme.colors.danger
                : Theme.colors.text;

              return (
                <Pressable
                  key={action.label}
                  onPress={() => run(action)}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && styles.rowPressed,
                  ]}
                  accessibilityRole="button"
                >
                  <Ionicons name={action.icon} size={20} color={color} />
                  <AppText style={[styles.label, { color }]} numberOfLines={1}>
                    {action.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

export default PulseActionSheet;

const styles = StyleSheet.create({
  bg: { backgroundColor: Theme.colors.surface, borderRadius: 24 },
  handle: { backgroundColor: "#D1D5DB", width: 40 },
  container: { paddingHorizontal: 16, paddingTop: 8 },
  group: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.colors.borderSoft,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 54,
    paddingHorizontal: 16,
    backgroundColor: Theme.colors.surface,
  },
  rowPressed: { backgroundColor: Theme.colors.surfaceSoft },
  label: { flexShrink: 1, fontSize: 15, fontFamily: Theme.fonts.body.medium },
});
