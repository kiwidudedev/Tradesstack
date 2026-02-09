import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import PillButton from "@/components/PillButton";
import TopBar from "@/components/TopBar";
import { useAuth } from "../../providers/AuthProvider";
import {
  fetchBusinessName,
  fetchUserBusinessId,
  getActiveBusinessId,
  setActiveBusinessId
} from "../../lib/business";
import { colors } from "@/theme/colors";
import { radius, spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadBusiness = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      let businessId = getActiveBusinessId();
      if (!businessId) {
        const { businessId: fetchedId, error } = await fetchUserBusinessId(user.id);
        if (!isMounted) return;
        if (error) {
          console.warn("Failed to load business membership", error);
          setLoading(false);
          return;
        }
        businessId = fetchedId;
        setActiveBusinessId(businessId);
      }

      if (businessId) {
        const { name, error } = await fetchBusinessName(businessId);
        if (!isMounted) return;
        if (error) {
          console.warn("Failed to load business name", error);
        } else {
          setBusinessName(name);
        }
      }

      setLoading(false);
    };

    loadBusiness();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <View style={styles.container}>
        <TopBar
          title="TradesStack"
          subtitle="Admin for NZ sole traders"
          inverted
          actions={[{ label: "Sign out", onPress: () => signOut() }]}
        />

        <View style={styles.hero}>
          <View style={styles.sparkleOne} />
          <View style={styles.sparkleTwo} />
          <View style={styles.sparkleThree} />

          {loading ? (
            <ActivityIndicator size="large" color={colors.textOnNavy} />
          ) : (
            <>
              <Text style={styles.headline}>WELCOME BACK</Text>
              <Text style={styles.businessName} numberOfLines={2}>
                {businessName ?? "Your business"}
              </Text>

              <View style={styles.infoBlock}>
                <Text style={styles.subtext}>Your workspace is ready.</Text>
              </View>

              <View style={styles.ctaRow}>
                <PillButton
                  label="Dashboard"
                  size="lg"
                  variant="primary"
                  onPress={() => router.replace("/(tabs)")}
                  fullWidth
                />
              </View>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.navy
  },
  container: {
    flex: 1,
    backgroundColor: colors.navy
  },
  hero: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    justifyContent: "center"
  },
  headline: {
    ...typography.heroTitle,
    color: colors.textOnNavy,
    fontSize: 42,
    lineHeight: 48,
    marginBottom: spacing.md
  },
  subtext: {
    ...typography.body,
    color: "rgba(255,255,255,0.9)",
    fontSize: 16,
    lineHeight: 24,
    marginBottom: spacing.lg
  },
  businessName: {
    ...typography.bodyBold,
    color: colors.textOnNavy,
    fontSize: 22,
    lineHeight: 28,
    marginBottom: spacing.md
  },
  infoBlock: {
    marginBottom: spacing.lg
  },
  ctaRow: {
    marginBottom: spacing.md
  },
  sparkleOne: {
    position: "absolute",
    top: 90,
    right: 40,
    width: 12,
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.9)"
  },
  sparkleTwo: {
    position: "absolute",
    top: 160,
    left: 48,
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.7)"
  },
  sparkleThree: {
    position: "absolute",
    bottom: 160,
    right: 80,
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: "rgba(247,72,23,0.8)"
  }
});
