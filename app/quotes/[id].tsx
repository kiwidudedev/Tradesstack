import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import Card from "@/components/Card";
import ListRow from "@/components/ListRow";
import PillButton from "@/components/PillButton";
import { getActiveBusinessId, listClients } from "@/lib/clients";
import { convertQuoteToInvoice, getDocumentWithItems } from "@/lib/documents";
import { getJobById } from "@/lib/jobs";
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

export default function QuoteDetailScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const quoteId = typeof params.id === "string" ? params.id : "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [quote, setQuote] = useState<null | {
    id: string;
    number: string;
    job_id: string;
    client_id: string | null;
    notes: string | null;
    subtotal: number;
    gst: number;
    total: number;
    items: Array<{ description: string; qty: number; unit?: string | null; rate: number; amount: number }>;
  }>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [jobName, setJobName] = useState("Job");
  const [jobId, setJobId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadQuote = async () => {
      if (!quoteId) {
        setError("Missing quote.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const record = await getDocumentWithItems(quoteId);
        if (!isMounted) return;

        setQuote({
          id: record.id,
          number: record.number,
          job_id: record.job_id,
          client_id: record.client_id,
          notes: record.notes ?? null,
          subtotal: record.subtotal,
          gst: record.gst,
          total: record.total,
          items: record.items.map((item) => ({
            description: item.description,
            qty: item.qty,
            unit: item.unit ?? null,
            rate: item.rate,
            amount: item.amount
          }))
        });

        setJobId(record.job_id ?? null);
        if (record.job_id) {
          const job = await getJobById(record.job_id);
          if (!isMounted) return;
          setJobName(job.name);
        }

        if (user) {
          const businessId = await getActiveBusinessId(user.id);
          const clients = await listClients(businessId);
          const match = clients.find((c) => c.id === record.client_id);
          setClientName(match?.name ?? null);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load quote.";
        if (!isMounted) return;
        setError(message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadQuote();

    return () => {
      isMounted = false;
    };
  }, [quoteId, user]);

  const totals = useMemo(() => {
    if (!quote) return null;
    return {
      subtotal: quote.subtotal,
      gst: quote.gst,
      total: quote.total
    };
  }, [quote]);

  const handleConvert = async () => {
    if (!quoteId) return;
    setConverting(true);
    setError(null);

    try {
      const { invoiceId } = await convertQuoteToInvoice(quoteId);
      Alert.alert("Invoice created", "Your quote was converted to an invoice.");
      router.replace("/invoices");
      console.log("invoice-created", invoiceId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to convert quote.";
      console.log("quote-convert:error", message);
      setError(message);
    } finally {
      setConverting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.heroStrip, { paddingTop: insets.top + spacing.sm }]}> 
          <View style={styles.heroInner}>
            <View style={styles.heroRow}>
              <Text style={styles.heroTitle}>Quote</Text>
              <Pressable onPress={() => router.back()} hitSlop={8}>
                <Text style={styles.heroAction}>Back</Text>
              </Pressable>
            </View>
            <Text style={styles.heroSubtitle}>Review before converting.</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" />
          </View>
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : quote ? (
          <>
            <Text style={styles.title}>{quote.number ?? "Quote"}</Text>
            <Text style={styles.subtitle}>{clientName ?? "Client"}</Text>

            <Card style={styles.card}>
              <ListRow title="Job" subtitle={jobName} showDivider={false} />
              <View style={styles.cardButtonRow}>
                <PillButton
                  label="View Job"
                  onPress={() =>
                    jobId ? router.push({ pathname: "/jobs/[id]", params: { id: jobId } }) : null
                  }
                  disabled={!jobId}
                />
              </View>
            </Card>

            <Card style={styles.card}>
              <ListRow title="Notes" subtitle={quote.notes ?? "No notes"} showDivider={false} />
            </Card>

            <Text style={styles.sectionTitle}>Line items</Text>
            <Card>
              {quote.items.map((item, index) => (
                <ListRow
                  key={`${item.description}-${index}`}
                  title={item.description}
                  subtitle={`Qty ${item.qty} • Rate ${formatMoney(item.rate)}`}
                  rightText={formatMoney(item.amount)}
                  showDivider={index < quote.items.length - 1}
                />
              ))}
            </Card>

            {totals ? (
              <Card style={styles.totalsCard}>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Subtotal</Text>
                  <Text style={styles.totalValue}>{formatMoney(totals.subtotal)}</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>GST</Text>
                  <Text style={styles.totalValue}>{formatMoney(totals.gst)}</Text>
                </View>
                <View style={[styles.totalRow, styles.totalRowFinal]}>
                  <Text style={styles.totalLabelFinal}>Total</Text>
                  <Text style={styles.totalValueFinal}>{formatMoney(totals.total)}</Text>
                </View>
              </Card>
            ) : null}

            <View style={styles.buttonStack}>
              <PillButton
                label={converting ? "Converting..." : "Convert to Invoice"}
                size="lg"
                fullWidth
                onPress={handleConvert}
                disabled={converting}
              />
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.surface
  },
  content: {
    paddingBottom: spacing.xxl
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
    paddingTop: spacing.sm
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
  title: {
    ...typography.screenTitle,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg
  },
  card: {
    marginBottom: spacing.lg,
    marginHorizontal: spacing.lg
  },
  cardButtonRow: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md
  },
  sectionTitle: {
    ...typography.sectionTitle,
    color: colors.text,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg
  },
  totalsCard: {
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
    marginHorizontal: spacing.lg
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm
  },
  totalRowFinal: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.xs,
    paddingTop: spacing.md
  },
  totalLabel: {
    ...typography.body,
    color: colors.textMuted
  },
  totalValue: {
    ...typography.bodyBold,
    color: colors.text
  },
  totalLabelFinal: {
    ...typography.cardTitle,
    color: colors.text
  },
  totalValueFinal: {
    ...typography.cardTitle,
    color: colors.text
  },
  buttonStack: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm
  },
  loadingWrap: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl
  }
});
