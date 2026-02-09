import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

export interface TopBarAction {
  label: string;
  onPress?: () => void;
}

interface TopBarProps {
  title?: string;
  subtitle?: string;
  actions?: TopBarAction[];
  inverted?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  title = "TradesStack",
  subtitle,
  actions = [],
  inverted = false
}) => {
  const titleColor = inverted ? colors.primary : colors.text;
  const subtitleColor = inverted ? "rgba(255,255,255,0.8)" : colors.textMuted;
  const actionColor = inverted ? colors.textOnNavy : colors.primary;

  return (
    <View style={styles.container}>
      <View>
        <Text style={[styles.title, { color: titleColor }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: subtitleColor }]}>{subtitle}</Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        {actions.map((action) => (
          <Pressable key={action.label} onPress={action.onPress} style={styles.actionButton}>
            <Text style={[styles.actionLabel, { color: actionColor }]}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  title: {
    ...typography.cardTitle,
    fontSize: 20
  },
  subtitle: {
    marginTop: 2,
    ...typography.body,
    fontSize: 13
  },
  actions: {
    flexDirection: "row",
    alignItems: "center"
  },
  actionButton: {
    marginLeft: spacing.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm
  },
  actionLabel: {
    ...typography.bodyBold,
    fontSize: 14
  }
});

export default TopBar;
