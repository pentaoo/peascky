import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  useApplicationRuntime,
  useApplicationSnapshot,
} from "../composition/composition-root";

const PRIMARY_SURFACE_ID = "primary-jam-field";

export function VisualRuntimeSlot(): React.JSX.Element {
  const runtime = useApplicationRuntime();
  const { visual } = useApplicationSnapshot();

  useEffect(() => {
    runtime.attachVisualSurface(PRIMARY_SURFACE_ID);
    return () => runtime.detachVisualSurface(PRIMARY_SURFACE_ID);
  }, [runtime]);

  return (
    <View accessibilityLabel="Future VisualRuntime mounting area" style={styles.surface}>
      <Text style={styles.eyebrow}>VISUALRUNTIME PORT</Text>
      <Text style={styles.title}>Future native scene slot</Text>
      <Text style={styles.detail}>Placeholder only · state: {visual.presentationState}</Text>
      <Text style={styles.detail}>No production renderer installed</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#3a536e",
    borderStyle: "dashed",
    borderRadius: 18,
    backgroundColor: "#101b29",
    padding: 24,
  },
  eyebrow: {
    color: "#7fa9d6",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  title: {
    color: "#f3f7fb",
    fontSize: 22,
    fontWeight: "600",
    textAlign: "center",
  },
  detail: {
    color: "#9aadc0",
    fontSize: 13,
    textAlign: "center",
  },
});
