import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";

import Card from "@/components/Card";
import PillButton from "@/components/PillButton";
import { calcLineAmount, calcTotals } from "@/lib/calc";
import { listClients, type Client, getActiveBusinessId } from "@/lib/clients";
import { createDocumentWithItems } from "@/lib/documents";
import { listJobs, type Job } from "@/lib/jobs";
import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { useAuth } from "../../providers/AuthProvider";

const GST_RATE = 0.15;

type QuoteItem = {
  id: string;
  description: string;
  qty: number;
  unit?: string | null;
  rate: number;
};

const formatMoney = (value: number) =>
  new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    minimumFractionDigits: 2
  }).format(value);

const createItem = (index: number): QuoteItem => ({
  id: `item-${Date.now()}-${index}`,
  description: "",
  qty: 1,
  rate: 0
});

export default function QuoteBuilderScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [clientIndex, setClientIndex] = useState(0);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<QuoteItem[]>([createItem(0)]);
  const [clients, setClients] = useState<Client[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [businessLoading, setBusinessLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobIndex, setJobIndex] = useState(-1);
  const [jobError, setJobError] = useState<string | null>(null);

  const client = clients[clientIndex];
  const job = jobIndex >= 0 ? jobs[jobIndex] : null;
  const totals = useMemo(() => calcTotals(items, GST_RATE), [items]);

  React.useEffect(() => {
    let isMounted = true;

    const loadBusiness = async () => {
      if (!user) return;
      setBusinessLoading(true);
      setError(null);

      try {
        const activeId = await getActiveBusinessId(user.id);
        if (!isMounted) return;
        setBusinessId(activeId);
        const [clientRows, jobRows] = await Promise.all([
          listClients(activeId),
          listJobs(activeId)
        ]);
        if (!isMounted) return;
        setClients(clientRows);
        setJobs(jobRows);
        setClientIndex(0);
        setJobIndex(-1);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to resolve business.";
        if (!isMounted) return;
        if (message === "NO_BUSINESS") {
          router.replace("/(app)/onboarding");
          return;
        }
        setError(message);
      } finally {
        if (isMounted) setBusinessLoading(false);
      }
    };

    loadBusiness();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  const cycleJob = () => {
    if (jobs.length === 0) {
      router.push("/jobs/new");
      return;
    }
    setJobIndex((prev) => (prev < 0 ? 0 : (prev + 1) % jobs.length));
    setJobError(null);
  };

  const cycleClient = () => {
    if (clients.length === 0) {
      router.push("/clients/new");
      return;
    }
    setClientIndex((prev) => (prev + 1) % clients.length);
  };

  const updateItem = (id: string, patch: Partial<QuoteItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const addItem = () => {
    setItems((prev) => [...prev, createItem(prev.length)]);
  };

  const handleSave = async () => {
    if (!user) return;
    setError(null);

    if (!businessId) {
      setError("We couldn't find your business yet. Please try again.");
      return;
    }

    if (!job) {
      setJobError("Select a job to continue");
      return;
    }

    if (!client) {
      setError("Select a client before saving.");
      return;
    }

    const normalizedItems = items
      .map((item) => ({
        ...item,
        description: item.description.trim()
      }))
      .filter((item) => item.description.length > 0);

    if (normalizedItems.length === 0) {
      setError("Add at least one line item with a description.");
      return;
    }

    if (normalizedItems.some((item) => item.qty <= 0 || item.rate < 0)) {
      setError("Each line item needs qty > 0 and rate >= 0.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        businessId,
        jobId: job.id,
        clientId: client.id,
        type: "quote" as const,
        notes: notes.trim(),
        items: normalizedItems.map((item) => ({
          description: item.description,
          qty: item.qty,
          unit: item.unit ?? null,
          rate: item.rate
        }))
      };

      await createDocumentWithItems(payload);
      router.replace("/quotes");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create quote.";
      const isRls = /row-level security|rls|permission denied/i.test(message);
      if (isRls) {
        console.log("quote-rls:user", user.id);
        console.log("quote-rls:business", businessId);
        console.log("quote-rls:payload", {
          clientId: client.id,
          notes: notes.trim(),
          items: normalizedItems
        });
      }
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleSendPdf = () => {
    Alert.alert("PDF ready", "TODO: Generate and send PDF.");
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.heroStrip, { paddingTop: insets.top + spacing.sm }]}>
          <View style={styles.heroInner}>
            <View style={styles.heroRow}>
              <Text style={styles.heroTitle}>Quote</Text>
              <Pressable onPress={() => router.back()} hitSlop={8}>
                <Text style={styles.heroAction}>Close</Text>
              </Pressable>
            </View>
            <Text style={styles.heroSubtitle}>Fast and clear</Text>
          </View>
        </View>

        <Text style={styles.title}>Quote builder</Text>
        <Text style={styles.subtitle}>Everything on one screen. 1–3 taps.</Text>

        <Card style={styles.card}>
          <View style={styles.fieldLabelRow}>
            <Text style={styles.fieldLabel}>Job</Text>
            <View style={styles.requiredPill}>
              <Text style={styles.requiredPillText}>Required</Text>
            </View>
          </View>
          <Pressable
            style={[styles.selector, !job && styles.selectorRequired]}
            onPress={cycleJob}
            disabled={businessLoading}
          >
            <View>
              <Text style={styles.selectorValue}>
                {businessLoading ? "Loading jobs..." : job?.name ?? "Select a job"}
              </Text>
              <Text style={styles.selectorHint}>
                {jobs.length === 0 ? "Tap to add a job" : "Tap to change"}
              </Text>
            </View>
            <Text style={styles.selectorAction}>{jobs.length === 0 ? "Add" : "Change"}</Text>
          </Pressable>
          <View style={styles.inlineActionRow}>
            <PillButton
              label="+ New Job"
              variant="secondary"
              onPress={() => router.push("/jobs/new")}
            />
          </View>
          {jobError ? <Text style={styles.inlineError}>{jobError}</Text> : null}

          <Text style={styles.fieldLabel}>Client</Text>
          <Pressable style={styles.selector} onPress={cycleClient} disabled={businessLoading}>
            <View>
              <Text style={styles.selectorValue}>
                {businessLoading ? "Loading clients..." : client?.name ?? "Add a client"}
              </Text>
              <Text style={styles.selectorHint}>
                {clients.length === 0 ? "Tap to add a client" : "Tap to change"}
              </Text>
            </View>
            <Text style={styles.selectorAction}>{clients.length === 0 ? "Add" : "Change"}</Text>
          </Pressable>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Job title</Text>
            <TextInput value={notes} onChangeText={setNotes} style={styles.input} />
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>GST rate (%)</Text>
            <TextInput value={String(GST_RATE * 100)} editable={false} style={styles.input} />
          </View>
        </Card>

        <Text style={styles.sectionTitle}>Line items</Text>
        {items.map((item, index) => (
          <Card key={item.id} style={styles.itemCard}>
            <Text style={styles.itemHeader}>Item {index + 1}</Text>

            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              value={item.description}
              onChangeText={(text) => updateItem(item.id, { description: text })}
              placeholder="Labour, materials, callouts"
              placeholderTextColor="#94A3B8"
              style={styles.input}
            />

            <View style={styles.itemRow}>
              <View style={styles.itemField}>
                <Text style={styles.fieldLabel}>Qty</Text>
                <TextInput
                  value={String(item.qty)}
                  onChangeText={(text) => updateItem(item.id, { qty: Number(text) || 0 })}
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
              </View>
              <View style={styles.itemField}>
                <Text style={styles.fieldLabel}>Unit price</Text>
                <TextInput
                  value={String(item.rate)}
                  onChangeText={(text) => updateItem(item.id, { rate: Number(text) || 0 })}
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
              </View>
            </View>

            <View style={styles.lineTotalRow}>
              <Text style={styles.lineTotalLabel}>Line total</Text>
              <Text style={styles.lineTotalValue}>
                {formatMoney(calcLineAmount(item.qty || 0, item.rate || 0))}
              </Text>
            </View>
          </Card>
        ))}

        <PillButton label="Add line item" variant="secondary" onPress={addItem} style={styles.addItemButton} />

        <Card style={styles.totalsCard}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{formatMoney(totals.subtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>GST ({Math.round(GST_RATE * 100)}%)</Text>
            <Text style={styles.totalValue}>{formatMoney(totals.gst)}</Text>
          </View>
          <View style={[styles.totalRow, styles.totalRowFinal]}>
            <Text style={styles.totalLabelFinal}>Total</Text>
            <Text style={styles.totalValueFinal}>{formatMoney(totals.total)}</Text>
          </View>
        </Card>

        {businessLoading && clients.length === 0 ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.navy} />
            <Text style={styles.loadingText}>Loading business…</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.buttonStack}>
          <PillButton
            label={saving ? "Saving..." : "Save Quote"}
            size="lg"
            fullWidth
            onPress={handleSave}
            disabled={saving || businessLoading || !job}
          />
          <PillButton label="Send PDF" size="lg" fullWidth variant="secondary" onPress={handleSendPdf} />
          <PillButton
            label="Convert to Invoice"
            size="lg"
            fullWidth
            variant="ghost"
            onPress={() => router.push("/invoices/new")}
          />
        </View>
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
  fieldBlock: {
    marginTop: spacing.md
  },
  fieldLabel: {
    ...typography.label,
    color: colors.textMuted,
    marginBottom: spacing.xs
  },
  fieldLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  requiredPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt
  },
  requiredPillText: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 12
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.text
  },
  selector: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceAlt
  },
  selectorRequired: {
    borderColor: colors.danger
  },
  inlineActionRow: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm
  },
  selectorValue: {
    ...typography.bodyBold,
    color: colors.text
  },
  selectorHint: {
    marginTop: 2,
    ...typography.body,
    color: colors.textMuted,
    fontSize: 13
  },
  selectorAction: {
    ...typography.bodyBold,
    color: colors.primary
  },
  inlineError: {
    ...typography.body,
    color: colors.danger,
    marginTop: spacing.xs,
    marginBottom: spacing.sm
  },
  sectionTitle: {
    ...typography.sectionTitle,
    color: colors.text,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg
  },
  itemCard: {
    marginBottom: spacing.md,
    marginHorizontal: spacing.lg
  },
  itemHeader: {
    ...typography.cardTitle,
    color: colors.text,
    marginBottom: spacing.sm
  },
  itemRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm
  },
  itemField: {
    flex: 1
  },
  lineTotalRow: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  lineTotalLabel: {
    ...typography.body,
    color: colors.textMuted
  },
  lineTotalValue: {
    ...typography.bodyBold,
    color: colors.text
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
  addItemButton: {
    marginHorizontal: spacing.lg
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm
  },
  loadingText: {
    ...typography.body,
    color: colors.textMuted
  }
});
