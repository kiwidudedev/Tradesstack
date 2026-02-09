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

export default function InvoicesScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [invoices, setInvoices] = useState<DocumentRow[]>([]);
  const [clientsById, setClientsById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadInvoices = useCallback(
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
        const [invoiceRows, clientRows] = await Promise.all([
          listDocuments(businessId, "invoice"),
          listClients(businessId)
        ]);
        const clientMap = clientRows.reduce<Record<string, string>>((acc, client) => {
          acc[client.id] = client.name;
          return acc;
        }, {});
        setClientsById(clientMap);
        setInvoices(invoiceRows);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load invoices.";
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
      loadInvoices();
    }, [loadInvoices])
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <View style={[styles.heroStrip, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.heroInner}>
          <View style={styles.heroRow}>
            <Text style={styles.heroTitle}>Invoices</Text>
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Text style={styles.heroAction}>Back</Text>
            </Pressable>
          </View>
          <Text style={styles.heroSubtitle}>Send, track, and get paid.</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadInvoices("refresh")} />}
      >
        <View style={styles.ctaRow}>
          <PillButton
            label="+ New Invoice"
            size="lg"
            fullWidth
            onPress={() => router.push("/invoices/new")}
          />
        </View>

        {loading ? (
          <ActivityIndicator size="large" />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : invoices.length === 0 ? (
          <Text style={styles.emptyText}>No invoices yet — add your first one.</Text>
        ) : (
          <Card>
            {invoices.map((invoice, index) => {
              const clientName = invoice.client_id ? clientsById[invoice.client_id] : null;
              const subtitle = `${clientName ?? "Client"} • ${formatMoney(invoice.total ?? 0)}`;
              return (
                <ListRow
                  key={invoice.id}
                  title={invoice.number ?? "Invoice"}
                  subtitle={subtitle}
                  rightText={invoice.status ? invoice.status.replace(/_/g, " ") : "Draft"}
                  onPress={() => router.push(`/invoices/${invoice.id}`)}
                  showDivider={index < invoices.length - 1}
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
