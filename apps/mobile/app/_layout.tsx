import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ApplicationCompositionRoot } from "../src/composition/composition-root";
import { AppErrorBoundary } from "../src/platform/app-error-boundary";

export default function RootLayout(): React.JSX.Element {
  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <ApplicationCompositionRoot>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              contentStyle: { backgroundColor: "#0b1119" },
              headerStyle: { backgroundColor: "#0b1119" },
              headerTintColor: "#f3f7fb",
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="diagnostics" options={{ title: "Diagnostics" }} />
          </Stack>
        </ApplicationCompositionRoot>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}
