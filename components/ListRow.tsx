import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

interface ListRowProps {
  title: string;
  subtitle?: string;
  rightText?: string;
  onPress?: () => void;
  showDivider?: boolean;
}

export const ListRow: React.FC<ListRowProps> = ({
  title,
  subtitle,
  rightText,
  onPress,
  showDivider = true
}) => {
  const content = (
    <View style={[styles.row, showDivider && styles.divider]}>
      <View style={styles.left}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {rightText ? <Text style={styles.rightText}>{rightText}</Text> : null}
    </View>
  );

  if (onPress) {
    return <Pressable onPress={onPress}>{content}</Pressable>;
  }

  return content;
};

const styles = StyleSheet.create({
  row: {
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  left: {
    flex: 1,
    paddingRight: spacing.md
  },
  title: {
    ...typography.bodyBold,
    color: colors.text
  },
  subtitle: {
    marginTop: 4,
    ...typography.body,
    color: colors.textMuted
  },
  rightText: {
    ...typography.bodyBold,
    color: colors.primary
  }
});

export default ListRow;
