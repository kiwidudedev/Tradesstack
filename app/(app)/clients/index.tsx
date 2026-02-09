import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";

import Card from "@/components/Card";
import ListRow from "@/components/ListRow";
import PillButton from "@/components/PillButton";
import { useAuth } from "../../../providers/AuthProvider";
import { getActiveBusinessId, listClients, type Client } from "../../../lib/clients";
import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

export default function ClientsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadClients = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const businessId = await getActiveBusinessId(user.id);
      const rows = await listClients(businessId);
      setClients(rows);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load clients.";
      if (message === "NO_BUSINESS") {
        router.replace("/(app)/onboarding");
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadClients();
    }, [loadClients])
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <View style={[styles.heroStrip, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.heroInner}>
          <View style={styles.heroRow}>
            <Text style={styles.heroTitle}>Clients</Text>
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Text style={styles.heroAction}>Back</Text>
            </Pressable>
          </View>
          <Text style={styles.heroSubtitle}>Keep your contacts tidy and ready to quote.</Text>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.ctaRow}>
          <PillButton
            label="+ New Client"
            size="lg"
            fullWidth
            onPress={() => router.push("/clients/new")}
          />
        </View>

        {loading ? (
          <ActivityIndicator size="large" />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : clients.length === 0 ? (
          <Text style={styles.emptyText}>No clients yet — add your first one.</Text>
        ) : (
          <Card>
            {clients.map((client, index) => (
              <ListRow
                key={client.id}
                title={client.name}
                subtitle={client.email ?? client.phone ?? client.address ?? "Client"}
                rightText="Open"
                onPress={() => router.push({ pathname: "/clients/[id]", params: { id: client.id } })}
                showDivider={index < clients.length - 1}
              />
            ))}
          </Card>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.surface
  },
  heroStrip: {
    backgroundColor: colors.navy,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    marginBottom: spacing.lg
  },
  heroInner: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  heroTitle: {
    ...typography.screenTitle,
    color: colors.textOnNavy,
    marginBottom: 4
  },
  heroAction: {
    ...typography.bodyBold,
    color: colors.textOnNavy
  },
  heroSubtitle: {
    ...typography.body,
    color: "rgba(255,255,255,0.85)"
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl
  },
  ctaRow: {
    marginBottom: spacing.lg
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted
  },
  errorText: {
    ...typography.body,
    color: colors.danger
  }
});
