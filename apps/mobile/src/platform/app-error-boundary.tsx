import { Component, type ErrorInfo, type PropsWithChildren } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type ErrorBoundaryState = Readonly<{ error: Error | null }>;

export class AppErrorBoundary extends Component<PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (__DEV__) console.error("Pocket Jam shell render failure", error, info.componentStack);
  }

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Pocket Jam could not mount.</Text>
        <Text selectable style={styles.message}>{this.state.error.message}</Text>
        <Pressable accessibilityRole="button" onPress={() => this.setState({ error: null })} style={styles.button}>
          <Text style={styles.buttonText}>Retry shell</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    backgroundColor: "#0b1119",
    padding: 28,
  },
  title: { color: "#f3f7fb", fontSize: 20, fontWeight: "700", textAlign: "center" },
  message: { color: "#eaa7a7", fontSize: 14, textAlign: "center" },
  button: { borderRadius: 10, backgroundColor: "#dae8f5", paddingHorizontal: 18, paddingVertical: 11 },
  buttonText: { color: "#102033", fontWeight: "700" },
});
