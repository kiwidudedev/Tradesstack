export const colors = {
  navy: "#04224D",
  navyDark: "#031B3D",
  primary: "#F74817",
  primaryDark: "#D83C12",
  textOnNavy: "#FFFFFF",
  surface: "#F5F7FB",
  surfaceAlt: "#FFFFFF",
  border: "#E6EAF2",
  text: "#0F172A",
  textMuted: "#475569",
  success: "#0FA958",
  warning: "#F59E0B",
  danger: "#E11D48"
} as const;

export type AppColor = (typeof colors)[keyof typeof colors];
