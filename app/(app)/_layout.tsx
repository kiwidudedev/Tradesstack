import React, { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { useAuth } from "../../providers/AuthProvider";
import { fetchUserBusinessId, getActiveBusinessId, setActiveBusinessId } from "../../lib/business";
import { colors } from "@/theme/colors";

export default function AppLayout() {
  const { user } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const [checkingBusiness, setCheckingBusiness] = useState(true);
  const [hasBusiness, setHasBusiness] = useState<boolean | null>(null);
  const [authRedirecting, setAuthRedirecting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const checkBusiness = async () => {
      if (!user) {
        setAuthRedirecting(true);
        setHasBusiness(null);
        setCheckingBusiness(true);
        router.replace("/(auth)/sign-in");
        return;
      }

      const cachedBusinessId = getActiveBusinessId();
      if (hasBusiness === true && cachedBusinessId) {
        setAuthRedirecting(false);
        setCheckingBusiness(false);
        return;
      }

      setAuthRedirecting(false);
      setCheckingBusiness(true);
      const { businessId, error } = await fetchUserBusinessId(user.id);
      if (!isMounted) return;

      if (error) {
        console.warn("Failed to check business membership", error);
        setHasBusiness(false);
        setActiveBusinessId(null);
        setCheckingBusiness(false);
        return;
      }

      setActiveBusinessId(businessId);
      setHasBusiness(Boolean(businessId));
      setCheckingBusiness(false);
    };

    checkBusiness();

    return () => {
      isMounted = false;
    };
  }, [hasBusiness, router, segments, user?.id]);

  useEffect(() => {
    if (checkingBusiness || !user) return;

    const inOnboarding = segments[1] === "onboarding";

    if (hasBusiness === false && !inOnboarding) {
      router.replace("/(app)/onboarding");
      return;
    }

    if (hasBusiness === true && inOnboarding) {
      router.replace("/(tabs)");
    }
  }, [checkingBusiness, hasBusiness, router, segments]);

  if (authRedirecting || checkingBusiness || !user) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
        <ActivityIndicator size="large" color={colors.navy} />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
