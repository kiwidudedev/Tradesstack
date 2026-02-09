import React from "react";
import { Tabs } from "expo-router";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";

import BottomNavBar from "@/components/navigation/BottomNavBar";
import { TAB_BAR_ACTIVE_TINT, TAB_BAR_ICON_SIZE, TAB_BAR_INACTIVE_TINT } from "@/theme/tabBarStyles";

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => {
        const items = props.state.routes.map((route, index) => {
          const { options } = props.descriptors[route.key];
          const label = options.tabBarLabel ?? options.title ?? route.name;
          const isFocused = props.state.index === index;
          const color = isFocused ? TAB_BAR_ACTIVE_TINT : TAB_BAR_INACTIVE_TINT;

          const onPress = () => {
            const event = props.navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true
            });
            if (!isFocused && !event.defaultPrevented) {
              props.navigation.navigate(route.name);
            }
          };

          const icon =
            typeof options.tabBarIcon === "function" ? (
              options.tabBarIcon({ focused: isFocused, color, size: TAB_BAR_ICON_SIZE })
            ) : (
              <FontAwesome5 name="hammer" size={TAB_BAR_ICON_SIZE} color={color} solid />
            );

          return {
            key: route.key,
            label: typeof label === "string" ? label : route.name,
            icon,
            onPress,
            isActive: isFocused
          };
        });

        return <BottomNavBar items={items} />;
      }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: undefined,
        tabBarInactiveTintColor: undefined
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen
        name="create"
        options={{
          title: "Job Hub",
          tabBarLabel: "Job Hub"
        }}
      />
      <Tabs.Screen name="money" options={{ title: "Financials" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
