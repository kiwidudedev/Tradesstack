import { TextStyle } from "react-native";

export const typography = {
  heroTitle: {
    fontSize: 42,
    fontWeight: "900" as TextStyle["fontWeight"],
    letterSpacing: -0.6,
    lineHeight: 46
  },
  screenTitle: {
    fontSize: 32,
    fontWeight: "900" as TextStyle["fontWeight"],
    letterSpacing: -0.5,
    lineHeight: 36
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800" as TextStyle["fontWeight"],
    letterSpacing: -0.2,
    lineHeight: 24
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800" as TextStyle["fontWeight"],
    letterSpacing: -0.2,
    lineHeight: 22
  },
  body: {
    fontSize: 15,
    fontWeight: "500" as TextStyle["fontWeight"],
    lineHeight: 20
  },
  bodyBold: {
    fontSize: 15,
    fontWeight: "700" as TextStyle["fontWeight"],
    lineHeight: 20
  },
  label: {
    fontSize: 13,
    fontWeight: "700" as TextStyle["fontWeight"],
    letterSpacing: 0.2,
    textTransform: "uppercase" as TextStyle["textTransform"]
  },
  statNumber: {
    fontSize: 34,
    fontWeight: "900" as TextStyle["fontWeight"],
    letterSpacing: -0.5,
    lineHeight: 38
  }
} as const;
