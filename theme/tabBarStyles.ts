import { colors } from "@/theme/colors";

export const TAB_BAR_HEIGHT = 64;
export const TAB_BAR_PADDING_TOP = 4;
export const TAB_BAR_PADDING_BOTTOM = 8;
export const TAB_BAR_ICON_SIZE = 20;
export const TAB_BAR_LABEL_STYLE = { fontSize: 11, fontWeight: "700", lineHeight: 13 } as const;
export const TAB_BAR_ACTIVE_TINT = "#FFFFFF";
export const TAB_BAR_INACTIVE_TINT = "rgba(255,255,255,0.6)";
export const TAB_BAR_RADIUS = 28;

export const TAB_BAR_STYLE = {
  backgroundColor: colors.navy,
  borderTopColor: "transparent",
  borderTopLeftRadius: TAB_BAR_RADIUS,
  borderTopRightRadius: TAB_BAR_RADIUS,
  height: TAB_BAR_HEIGHT,
  paddingBottom: TAB_BAR_PADDING_BOTTOM,
  paddingTop: TAB_BAR_PADDING_TOP,
  elevation: 0,
  shadowOpacity: 0,
  overflow: "hidden"
} as const;
