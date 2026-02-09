import React from "react";
import { Stack } from "expo-router";

export default function JobStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="todos/index" />
      <Stack.Screen name="todos/new" />
      <Stack.Screen name="todos/[todoId]" />
    </Stack>
  );
}
