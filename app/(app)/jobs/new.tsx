import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { listClients, type Client, getActiveBusinessId } from "@/lib/clients";
import { createJob } from "@/lib/jobs";
import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { useAuth } from "../../../providers/AuthProvider";

export default function NewJobScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [clientIndex, setClientIndex] = useState(-1);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [businessLoading, setBusinessLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const client = clientIndex >= 0 ? clients[clientIndex] : null;

  useEffect(() => {
    let isMounted = true;

    const loadBusiness = async () => {
      if (!user) return;
      setBusinessLoading(true);
      setError(null);

      try {
        const activeId = await getActiveBusinessId(user.id);
        if (!isMounted) return;
        setBusinessId(activeId);
        const rows = await listClients(activeId);
        if (!isMounted) return;
        setClients(rows);
        setClientIndex(-1);
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

  const cycleClient = () => {
    if (clients.length === 0) {
      router.push("/clients/new");
      return;
    }

    setClientIndex((prev) => {
      if (prev < 0) return 0;
      if (prev >= clients.length - 1) return -1;
      return prev + 1;
    });
  };

  const handleSave = async () => {
    if (!user) return;
    setError(null);

    if (!businessId) {
      setError("We couldn't find your business yet. Please try again.");
      return;
    }

    if (!name.trim()) {
      setError("Job name is required.");
      return;
    }

    if (!siteAddress.trim()) {
      setError("Site address is required.");
      return;
    }

    setSaving(true);

    try {
      const job = await createJob(businessId, {
        name: name.trim(),
        site_address: siteAddress.trim(),
        client_id: client?.id ?? null,
        status: "active"
      });

      router.replace({ pathname: "/jobs/[id]", params: { id: job.id } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create job.";
      const isRls = /row-level security|rls|permission denied/i.test(message);
      if (isRls) {
        console.log("job-rls:user", user.id);
        console.log("job-rls:business", businessId);
        console.log("job-rls:payload", {
          name: name.trim(),
          siteAddress: siteAddress.trim(),
          clientId: client?.id ?? null
        });
      }
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.heroStrip, { paddingTop: insets.top + spacing.sm }]}> 
          <View style={styles.heroInner}>
            <View style={styles.heroRow}>
              <Text style={styles.heroTitle}>New Job</Text>
              <Pressable onPress={() => router.back()} hitSlop={8}>
                <Text style={styles.heroAction}>Close</Text>
              </Pressable>
            </View>
            <Text style={styles.heroSubtitle}>Define the job before the paperwork.</Text>
          </View>
        </View>

        <Text style={styles.title}>Job details</Text>
        <Text style={styles.subtitle}>Every quote, invoice, PO, and safety record needs one.</Text>

        <Card style={styles.card}>
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Job name</Text>
            <TextInput value={name} onChangeText={setName} style={styles.input} />
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Site address</Text>
            <TextInput value={siteAddress} onChangeText={setSiteAddress} style={styles.input} />
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Client (optional)</Text>
            <Pressable style={styles.selector} onPress={cycleClient} disabled={businessLoading}>
              <View>
                <Text style={styles.selectorValue}>
                  {businessLoading
                    ? "Loading clients..."
                    : client?.name ?? "No client selected"}
                </Text>
                <Text style={styles.selectorHint}>
                  {clients.length === 0 ? "Tap to add a client" : "Tap to change"}
                </Text>
              </View>
              <Text style={styles.selectorAction}>{clients.length === 0 ? "Add" : "Change"}</Text>
            </Pressable>
          </View>
        </Card>

        {businessLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.navy} />
            <Text style={styles.loadingText}>Loading business…</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.buttonStack}>
          <PillButton
            label={saving ? "Saving..." : "Create Job"}
            size="lg"
            fullWidth
            onPress={handleSave}
            disabled={saving || businessLoading}
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
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm
  },
  buttonStack: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg
  }
});
