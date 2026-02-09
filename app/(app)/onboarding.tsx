import React, { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import PillButton from "@/components/PillButton";
import TopBar from "@/components/TopBar";
import { useAuth } from "../../providers/AuthProvider";
import { createBusinessWithOwner, setActiveBusinessId } from "../../lib/business";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

export default function BusinessOnboardingScreen() {
  const { user, signOut } = useAuth();
  const [businessName, setBusinessName] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      router.replace("/(auth)/sign-in");
    }
  }, [router, user]);

  const handleSignOut = async () => {
    await signOut();
    router.replace("/(auth)/sign-in");
  };

  const handleCreateBusiness = async () => {
    if (!user) {
      setError("You must be signed in to create a business.");
      return;
    }
    if (!businessName.trim()) {
      setError("Business name is required.");
      return;
    }

    setLoading(true);
    setError(null);

    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({ id: user.id }, { onConflict: "id" });

    if (profileError) {
      setLoading(false);
      setError(profileError.message);
      return;
    }

    const { businessId, error: createError } = await createBusinessWithOwner({
      userId: user.id,
      name: businessName.trim(),
      gstNumber: gstNumber.trim() || null,
      address: address.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null
    });

    setLoading(false);

    if (createError || !businessId) {
      setError(createError ?? "Failed to create business.");
      return;
    }

    setActiveBusinessId(businessId);
    Alert.alert("Business created", "Welcome to TradesStack.", [
      { text: "OK", onPress: () => router.replace("/(tabs)") }
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <View style={styles.container}>
        <TopBar
          title="TradesStack"
          subtitle="Set up your business"
          inverted
          actions={[{ label: "Sign out", onPress: handleSignOut }]}
        />

        <View style={styles.form}>
          <Text style={styles.title}>Create your business</Text>
          <Text style={styles.subtitle}>We use this to personalize your workspace.</Text>

          <TextInput
            style={styles.input}
            placeholder="Business name *"
            placeholderTextColor="rgba(15,23,42,0.45)"
            value={businessName}
            onChangeText={setBusinessName}
          />
          <TextInput
            style={styles.input}
            placeholder="GST number (optional)"
            placeholderTextColor="rgba(15,23,42,0.45)"
            value={gstNumber}
            onChangeText={setGstNumber}
          />
          <TextInput
            style={styles.input}
            placeholder="Address (optional)"
            placeholderTextColor="rgba(15,23,42,0.45)"
            value={address}
            onChangeText={setAddress}
          />
          <TextInput
            style={styles.input}
            placeholder="Email (optional)"
            placeholderTextColor="rgba(15,23,42,0.45)"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Phone (optional)"
            placeholderTextColor="rgba(15,23,42,0.45)"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <PillButton
            label={loading ? "Creating..." : "Create business"}
            onPress={handleCreateBusiness}
            disabled={loading}
            fullWidth
            size="lg"
          />
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
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.xl
  },
  form: {
    flex: 1,
    paddingTop: spacing.lg
  },
  title: {
    ...typography.heroTitle,
    color: colors.textOnNavy,
    fontSize: 36,
    lineHeight: 42,
    marginBottom: spacing.sm
  },
  subtitle: {
    ...typography.body,
    color: "rgba(255,255,255,0.85)",
    marginBottom: spacing.lg
  },
  input: {
    ...typography.body,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    color: colors.text
  },
  error: {
    ...typography.body,
    color: colors.danger ?? "#c00",
    marginBottom: spacing.sm
  }
});
