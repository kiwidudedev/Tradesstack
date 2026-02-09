import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";
import {
  TAB_BAR_ACTIVE_TINT,
  TAB_BAR_ICON_SIZE,
  TAB_BAR_INACTIVE_TINT,
  TAB_BAR_LABEL_STYLE,
  TAB_BAR_RADIUS
} from "@/theme/tabBarStyles";

export const BOTTOM_BAR_CONTENT_HEIGHT = 64;

export type BottomNavBarItem = {
  key: string;
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  isActive?: boolean;
};

type BottomNavBarProps = {
  backgroundColor?: string;
  items: BottomNavBarItem[];
};

export default function BottomNavBar({
  backgroundColor = colors.navy,
  items
}: BottomNavBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor,
          borderTopLeftRadius: TAB_BAR_RADIUS,
          borderTopRightRadius: TAB_BAR_RADIUS
        }
      ]}
    >
      <View style={[styles.contentArea, { height: BOTTOM_BAR_CONTENT_HEIGHT, backgroundColor }]}>
        <View style={styles.row}>
          {items.map((item) => {
            const color = item.isActive ? TAB_BAR_ACTIVE_TINT : TAB_BAR_INACTIVE_TINT;
            return (
              <Pressable key={item.key} style={styles.item} onPress={item.onPress} hitSlop={6}>
                <View style={styles.itemInner}>
                  {item.icon}
                  <Text style={[styles.label, { color }]} numberOfLines={1} ellipsizeMode="tail">
                    {item.label}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={{ height: insets.bottom, backgroundColor }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: "hidden"
  },
  contentArea: {
    width: "100%"
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingHorizontal: spacing.lg
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  itemInner: {
    alignItems: "center",
    justifyContent: "center"
  },
  label: {
    ...TAB_BAR_LABEL_STYLE,
    marginTop: 2
  }
});
