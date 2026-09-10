import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApplicationSnapshot } from "../src/composition/composition-root";
import { VisualRuntimeSlot } from "../src/visual/visual-runtime-slot";

export default function JamShellScreen(): React.JSX.Element {
  const { lifecycle, project } = useApplicationSnapshot();

  return (
    <SafeAreaView edges={["top", "right", "bottom", "left"]} style={styles.safeArea}>
      <View style={styles.fieldRegion}>
        <VisualRuntimeSlot />
      </View>

      <View style={styles.controlRegion}>
        <View style={styles.headerRow}>
          <View style={styles.headerInfo}>
            <Text style={styles.eyebrow}>N04 ENGINEERING SHELL</Text>
            <Text numberOfLines={1} style={styles.projectName}>{project.name}</Text>
          </View>
          <View style={styles.bpmChip}>
            <Text style={styles.bpmValue}>{project.bpm}</Text>
            <Text style={styles.bpmLabel}>BPM</Text>
          </View>
        </View>

        <Text style={styles.status}>
          {project.instrumentCount} instruments · {project.occupiedCellCount}/20 occupied cells
        </Text>
        <Text style={styles.status}>Lifecycle: {lifecycle.appState} · {lifecycle.intent}</Text>

        <Link href="/diagnostics" asChild>
          <Pressable accessibilityRole="button" style={styles.button}>
            <Text style={styles.buttonText}>Open diagnostics</Text>
          </Pressable>
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, gap: 12, backgroundColor: "#0b1119", padding: 12 },
  fieldRegion: { flex: 7 },
  controlRegion: {
    flex: 3,
    justifyContent: "space-between",
    gap: 8,
    borderRadius: 18,
    backgroundColor: "#152234",
    padding: 16,
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headerInfo: { flex: 1 },
  eyebrow: { color: "#7fa9d6", fontSize: 10, fontWeight: "700", letterSpacing: 1.3 },
  projectName: { color: "#f3f7fb", fontSize: 20, fontWeight: "700" },
  bpmChip: { alignItems: "center", borderRadius: 12, backgroundColor: "#243851", paddingHorizontal: 13, paddingVertical: 8 },
  bpmValue: { color: "#f3f7fb", fontSize: 17, fontWeight: "700" },
  bpmLabel: { color: "#9aadc0", fontSize: 9, fontWeight: "700" },
  status: { color: "#aebdca", fontSize: 12 },
  button: { alignItems: "center", borderRadius: 10, backgroundColor: "#dae8f5", paddingVertical: 11 },
  buttonText: { color: "#102033", fontWeight: "700" },
});
