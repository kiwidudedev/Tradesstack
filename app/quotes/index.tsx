import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";

import Card from "@/components/Card";
import ListRow from "@/components/ListRow";
import PillButton from "@/components/PillButton";
import { getActiveBusinessId, listClients } from "@/lib/clients";
import { listDocuments, type DocumentRow } from "@/lib/documents";
import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { useAuth } from "../../providers/AuthProvider";

const formatMoney = (value: number) =>
  new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    minimumFractionDigits: 2
  }).format(value);

export default function QuotesScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [quotes, setQuotes] = useState<DocumentRow[]>([]);
  const [clientsById, setClientsById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadQuotes = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!user) return;
      if (mode === "refresh") {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const businessId = await getActiveBusinessId(user.id);
        const [quoteRows, clientRows] = await Promise.all([
          listDocuments(businessId, "quote"),
          listClients(businessId)
        ]);
        const clientMap = clientRows.reduce<Record<string, string>>((acc, client) => {
          acc[client.id] = client.name;
          return acc;
        }, {});
        setClientsById(clientMap);
        setQuotes(quoteRows);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load quotes.";
        if (message === "NO_BUSINESS") {
          router.replace("/(app)/onboarding");
          return;
        }
        setError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [router, user]
  );

  useFocusEffect(
    useCallback(() => {
      loadQuotes();
    }, [loadQuotes])
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <View style={[styles.heroStrip, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.heroInner}>
          <View style={styles.heroRow}>
            <Text style={styles.heroTitle}>Quotes</Text>
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Text style={styles.heroAction}>Back</Text>
            </Pressable>
          </View>
          <Text style={styles.heroSubtitle}>Draft, send, and convert to invoices.</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadQuotes("refresh")} />}
      >
        <View style={styles.ctaRow}>
          <PillButton
            label="+ New Quote"
            size="lg"
            fullWidth
            onPress={() => router.push("/quotes/new")}
          />
        </View>

        {loading ? (
          <ActivityIndicator size="large" />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : quotes.length === 0 ? (
          <Text style={styles.emptyText}>No quotes yet — add your first one.</Text>
        ) : (
          <Card>
            {quotes.map((quote, index) => {
              const clientName = quote.client_id ? clientsById[quote.client_id] : null;
              const subtitle = `${clientName ?? "Client"} • ${formatMoney(quote.total ?? 0)}`;
              return (
                <ListRow
                  key={quote.id}
                  title={quote.number ?? "Quote"}
                  subtitle={subtitle}
                  rightText={quote.status ? quote.status.replace(/_/g, " ") : "Draft"}
                  onPress={() => router.push({ pathname: "/quotes/[id]", params: { id: quote.id } })}
                  showDivider={index < quotes.length - 1}
                />
              );
            })}
          </Card>
        )}
      </ScrollView>
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
