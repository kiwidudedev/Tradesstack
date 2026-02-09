import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
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
import { getDocumentWithItems } from "@/lib/documents";
import { getJobById } from "@/lib/jobs";
import { supabase } from "@/lib/supabase";
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

export default function InvoiceDetailScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const invoiceId = typeof params.id === "string" ? params.id : "";

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<null | {
    id: string;
    number: string;
    status: string;
    type: string;
    issue_date: string | null;
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
  const canExport = invoice?.type === "variation";

  useEffect(() => {
    let isMounted = true;

    const loadInvoice = async () => {
      if (!invoiceId) {
        setError("Missing invoice.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const record = await getDocumentWithItems(invoiceId);
        if (!isMounted) return;

        if (record.type !== "invoice" && record.type !== "variation") {
          setError("This document is not an invoice or variation.");
          setLoading(false);
          return;
        }

        setInvoice({
          id: record.id,
          number: record.number,
          status: record.status,
          type: record.type,
          issue_date: record.issue_date ?? null,
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
        const message = err instanceof Error ? err.message : "Failed to load invoice.";
        console.log("invoice-detail:error", message);
        if (!isMounted) return;
        setError(message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadInvoice();

    return () => {
      isMounted = false;
    };
  }, [invoiceId, user]);

  const totals = useMemo(() => {
    if (!invoice) return null;
    return {
      subtotal: invoice.subtotal,
      gst: invoice.gst,
      total: invoice.total
    };
  }, [invoice]);

  const handleExportPdf = async () => {
    if (!invoice?.id) return;
    setExporting(true);
    try {
      const { data, error: exportError } = await supabase.functions.invoke(
        "export-variation-pdf",
        { body: { documentId: invoice.id } }
      );
      if (exportError) {
        throw new Error(exportError.message);
      }
      if (!data?.signedUrl) {
        throw new Error("Missing signed URL.");
      }
      await Linking.openURL(data.signedUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to export PDF.";
      Alert.alert("Export failed", message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.heroStrip, { paddingTop: insets.top + spacing.sm }]}> 
          <View style={styles.heroInner}>
            <View style={styles.heroRow}>
              <Text style={styles.heroTitle}>Invoice</Text>
              <Pressable onPress={() => router.back()} hitSlop={8}>
                <Text style={styles.heroAction}>Back</Text>
              </Pressable>
            </View>
            <Text style={styles.heroSubtitle}>Track and follow up quickly.</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" />
          </View>
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : invoice ? (
          <>
            <Text style={styles.title}>{invoice.number ?? "Invoice"}</Text>
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
              <ListRow
                title="Status"
                subtitle={invoice.status ? invoice.status.replace(/_/g, " ") : "Draft"}
                showDivider
              />
              <ListRow
                title="Issue date"
                subtitle={invoice.issue_date ?? ""}
                showDivider
              />
              <ListRow title="Notes" subtitle={invoice.notes ?? "No notes"} showDivider={false} />
            </Card>

            <Text style={styles.sectionTitle}>Line items</Text>
            <Card>
              {invoice.items.map((item, index) => (
                <ListRow
                  key={`${item.description}-${index}`}
                  title={item.description}
                  subtitle={`Qty ${item.qty} • Rate ${formatMoney(item.rate)}`}
                  rightText={formatMoney(item.amount)}
                  showDivider={index < invoice.items.length - 1}
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

            {canExport ? (
              <View style={styles.exportRow}>
                <PillButton
                  label="Export PDF"
                  variant="primary"
                  fullWidth
                  loading={exporting}
                  onPress={handleExportPdf}
                />
              </View>
            ) : null}
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
  exportRow: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg
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
