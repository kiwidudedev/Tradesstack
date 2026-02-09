import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";

import Card from "@/components/Card";
import PillButton from "@/components/PillButton";
import { getClientById } from "@/lib/clients";
import { listDocumentsByJobId } from "@/lib/documents";
import { listJobTodos } from "@/lib/jobTodos";
import { getJobById, type Job } from "@/lib/jobs";
import { colors } from "@/theme/colors";
import BottomNavBar, { BOTTOM_BAR_CONTENT_HEIGHT } from "@/components/navigation/BottomNavBar";
import { TAB_BAR_ICON_SIZE, TAB_BAR_INACTIVE_TINT } from "@/theme/tabBarStyles";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

const formatMoney = (value: number) =>
  new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    minimumFractionDigits: 2
  }).format(value);

const NAVY = colors.navy;
const RADIUS = 28;
const H_PADDING = spacing.lg;

const formatStatus = (status?: string | null) => {
  if (!status) return "Draft";
  return status
    .replace(/_/g, " ")
    .split(" ")
    .map((part) => (part.length ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
};

const getStatusStyles = (status?: string | null) => {
  const normalized = status?.toLowerCase() ?? "draft";

  switch (normalized) {
    case "quoted":
    case "quote_sent":
      return { backgroundColor: colors.warning, textColor: colors.navyDark };
    case "active":
      return { backgroundColor: colors.primary, textColor: colors.textOnNavy };
    case "invoiced":
      return { backgroundColor: colors.navyDark, textColor: colors.textOnNavy };
    case "completed":
      return { backgroundColor: colors.success, textColor: colors.textOnNavy };
    default:
      return { backgroundColor: colors.border, textColor: colors.textMuted };
  }
};

type DocPreview = {
  id: string;
  number: string;
  status: string;
  total: number;
  created_at: string;
};
type TodoPreview = {
  id: string;
  title: string;
  notes: string | null;
  due_date: string | null;
  is_done: boolean;
  created_at: string;
};

export default function JobDetailScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const jobId = typeof params.id === "string" ? params.id : "";

  const [job, setJob] = useState<Job | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<DocPreview[]>([]);
  const [invoices, setInvoices] = useState<DocPreview[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<DocPreview[]>([]);
  const [variations, setVariations] = useState<DocPreview[]>([]);
  const [todos, setTodos] = useState<TodoPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadJob = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!jobId) {
        setError("Missing job.");
        setLoading(false);
        return;
      }

      if (mode === "refresh") {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const record = await getJobById(jobId);
        setJob(record);

        if (record.client_id) {
          const client = await getClientById(record.client_id);
          setClientName(client.name ?? null);
        } else {
          setClientName(null);
        }

        const [quoteRows, invoiceRows, poRows, todoRows] = await Promise.all([
          listDocumentsByJobId(jobId, "quote"),
          listDocumentsByJobId(jobId, "invoice"),
          listDocumentsByJobId(jobId, "po"),
          listJobTodos(jobId)
        ]);

        setQuotes(quoteRows);
        setInvoices(invoiceRows);
        setPurchaseOrders(poRows);
        setVariations([]);
        setTodos(todoRows);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load job.";
        setError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [jobId]
  );

  useEffect(() => {
    loadJob();
  }, [loadJob]);

  const summaryText = useMemo(() => {
    if (!job) return "";
    const site = job.site_address ?? "No site address";
    return clientName ? `${clientName} · ${site}` : site;
  }, [clientName, job]);

  const renderSection = (
    title: string,
    items: DocPreview[],
    onNew: () => void,
    onOpen: (id: string) => void,
    emptyText: string
  ) => {
    const latest = items[0];

    return (
      <Card style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle}>{title}</Text>
            <Text style={styles.sectionCount}>{items.length} total</Text>
          </View>
          <PillButton label="+ New" variant="secondary" onPress={onNew} />
        </View>

        {latest ? (
          <Pressable style={styles.latestRow} onPress={() => onOpen(latest.id)}>
            <View style={styles.latestMain}>
              <Text style={styles.latestTitle}>{latest.number}</Text>
              <Text style={styles.latestSubtitle}>
                {formatStatus(latest.status)} · {formatMoney(latest.total)}
              </Text>
            </View>
            <Text style={styles.latestAction}>Open</Text>
          </Pressable>
        ) : (
          <Text style={styles.emptyText}>{emptyText}</Text>
        )}
      </Card>
    );
  };

  const renderTodoSection = (items: TodoPreview[]) => {
    const latest = items[0];
    const dueText = latest?.due_date ? `Due ${latest.due_date}` : "No due date";
    const statusText = latest?.is_done ? "Done" : "To do";

    return (
      <Card style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle}>To-Do</Text>
            <Text style={styles.sectionCount}>{items.length} total</Text>
          </View>
          <PillButton
            label="+ New"
            variant="secondary"
            onPress={() => router.push({ pathname: "/jobs/[id]/todos/new", params: { id: jobId } })}
          />
        </View>

        {latest ? (
          <Pressable
            style={styles.latestRow}
            onPress={() =>
              router.push({
                pathname: "/jobs/[id]/todos/[todoId]",
                params: { id: jobId, todoId: latest.id }
              })
            }
          >
            <View style={styles.latestMain}>
              <Text style={styles.latestTitle}>{latest.title}</Text>
              <Text style={styles.latestSubtitle}>
                {dueText} • {statusText}
              </Text>
            </View>
            <Text style={styles.latestAction}>Open</Text>
          </Pressable>
        ) : (
          <Text style={styles.emptyText}>No to-dos yet.</Text>
        )}
      </Card>
    );
  };

  const contentPaddingBottom = spacing.xxl + BOTTOM_BAR_CONTENT_HEIGHT + insets.bottom + spacing.md;

  return (
    <View style={styles.screenWrap}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: contentPaddingBottom }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadJob("refresh")} />}
      >
        <View style={[styles.heroStrip, { paddingTop: insets.top + spacing.sm }]}>
          <View style={styles.heroInner}>
            <View style={styles.heroRow}>
              <Text style={styles.heroTitle}>{job?.name ?? "Job"}</Text>
              <Pressable onPress={() => router.back()} hitSlop={8}>
                <Text style={styles.heroAction}>Close</Text>
              </Pressable>
            </View>
            <Text style={styles.heroSubtitle}>Job dashboard</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" />
          </View>
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : job ? (
          <>
            <View style={styles.summaryWrap}>
              <View style={styles.summaryRow}>
                <View style={styles.summaryMain}>
                  <Text style={styles.summaryTitle}>Job summary</Text>
                  <Text style={styles.summaryText}>{summaryText}</Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    { backgroundColor: getStatusStyles(job.status).backgroundColor }
                  ]}
                >
                  <Text
                    style={[styles.statusText, { color: getStatusStyles(job.status).textColor }]}
                  >
                    {formatStatus(job.status)}
                  </Text>
                </View>
              </View>
            </View>

            {renderSection(
              "Quotes",
              quotes,
              () => router.push({ pathname: "/quotes/new", params: { jobId } }),
              (id) => router.push({ pathname: "/quotes/[id]", params: { id } }),
              "No quotes yet."
            )}

            {renderSection(
              "Invoices",
              invoices,
              () => router.push({ pathname: "/invoices/new", params: { jobId } }),
              (id) => router.push({ pathname: "/invoices/[id]", params: { id } }),
              "No invoices yet."
            )}

            {renderSection(
              "Variations",
              variations,
              () => router.push({ pathname: "/invoices/new", params: { jobId, variation: "1" } }),
              (id) => router.push({ pathname: "/invoices/[id]", params: { id } }),
              "No variations yet."
            )}

            {renderSection(
              "Purchase Orders",
              purchaseOrders,
              () => router.push({ pathname: "/pos/new", params: { jobId } }),
              (id) => router.push({ pathname: "/pos/[id]", params: { id } }),
              "No purchase orders yet."
            )}

            {renderTodoSection(todos)}
          </>
        ) : null}
      </ScrollView>

      <View style={styles.jobActionBarShell}>
        <BottomNavBar
          items={[
            {
              key: "quote",
              label: "Quote",
              icon: <FontAwesome5 name="file-alt" size={TAB_BAR_ICON_SIZE} color={TAB_BAR_INACTIVE_TINT} solid />,
              onPress: () => router.push({ pathname: "/quotes/new", params: { jobId } })
            },
            {
              key: "invoice",
              label: "Invoice",
              icon: <FontAwesome5 name="file-invoice" size={TAB_BAR_ICON_SIZE} color={TAB_BAR_INACTIVE_TINT} solid />,
              onPress: () => router.push({ pathname: "/invoices/new", params: { jobId } })
            },
            {
              key: "variation",
              label: "Variation",
              icon: <FontAwesome5 name="exchange-alt" size={TAB_BAR_ICON_SIZE} color={TAB_BAR_INACTIVE_TINT} solid />,
              onPress: () => router.push({ pathname: "/invoices/new", params: { jobId, variation: "1" } })
            },
            {
              key: "purchase-order",
              label: "Purchase Order",
              icon: <FontAwesome5 name="clipboard-list" size={TAB_BAR_ICON_SIZE} color={TAB_BAR_INACTIVE_TINT} solid />,
              onPress: () => router.push({ pathname: "/pos/new", params: { jobId } })
            }
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrap: {
    flex: 1,
    backgroundColor: colors.surface
  },
  content: {
    paddingBottom: spacing.xxl
  },
  heroStrip: {
    backgroundColor: NAVY,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: RADIUS,
    borderBottomRightRadius: RADIUS,
    marginBottom: spacing.lg
  },
  heroInner: {
    paddingHorizontal: H_PADDING,
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
    marginBottom: 4,
    flex: 1,
    paddingRight: spacing.md
  },
  heroAction: {
    ...typography.bodyBold,
    color: colors.textOnNavy
  },
  heroSubtitle: {
    ...typography.body,
    color: "rgba(255,255,255,0.85)"
  },
  summaryWrap: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md
  },
  summaryRow: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  summaryMain: {
    flex: 1
  },
  summaryTitle: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: 4
  },
  summaryText: {
    ...typography.body,
    color: colors.textMuted
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4
  },
  statusText: {
    ...typography.bodyBold,
    fontSize: 12
  },
  jobActionBarShell: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    elevation: 10
  },
  sectionCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.md
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm
  },
  sectionTitle: {
    ...typography.sectionTitle,
    color: colors.text
  },
  sectionCount: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: 2
  },
  latestRow: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  latestMain: {
    flex: 1,
    paddingRight: spacing.md
  },
  latestTitle: {
    ...typography.bodyBold,
    color: colors.text
  },
  latestSubtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: 4
  },
  latestAction: {
    ...typography.bodyBold,
    color: colors.primary
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    paddingVertical: spacing.sm
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
