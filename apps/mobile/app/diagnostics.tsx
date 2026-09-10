import { Link } from "expo-router";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApplicationSnapshot } from "../src/composition/composition-root";

export default function DiagnosticsScreen(): React.JSX.Element {
  const snapshot = useApplicationSnapshot();
  const { environment, lifecycle, project, interaction, visual, futureRuntimes } = snapshot;

  const rows: readonly (readonly [string, string])[] = [
    ["Environment", environment.appVariant],
    ["Application ID", environment.applicationId],
    ["Identifier status", environment.identifierStatus],
    ["Platform", Platform.OS],
    ["OS version", String(Platform.Version)],
    ["Lifecycle", `${lifecycle.appState} / ${lifecycle.intent}`],
    ["Transitions", String(lifecycle.transitionCount)],
    ["Project fixture", `${project.validation}: ${project.name}`],
    ["Project ID", project.id],
    ["Schema", String(project.schemaVersion)],
    ["Instruments / placements", `${project.instrumentCount} / ${project.placementCount}`],
    ["Occupied cells", `${project.occupiedCellCount} / 20`],
    ["Patterns / loops", `${project.patternCount} / ${project.loopCount}`],
    ["InteractionRuntime", `${interaction.implementationId}; enabled=${interaction.enabled}`],
    ["Active contacts", String(interaction.activeContactCount)],
    ["VisualRuntime", `${visual.implementationId}; ${visual.presentationState}`],
    ["Visual surface", visual.attachedSurfaceId ?? "detached on this route"],
    ["AudioRuntime", futureRuntimes.audio],
    ["Transport", futureRuntimes.transport],
    ["Persistence", futureRuntimes.persistence],
    ["SessionRuntime", futureRuntimes.session],
  ];

  return (
    <SafeAreaView edges={["right", "bottom", "left"]} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.note}>
          Low-frequency shell diagnostics only. No production audio, renderer, persistence, or session runtime is installed.
        </Text>

        <View style={styles.table}>
          {rows.map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={styles.label}>{label}</Text>
              <Text selectable style={styles.value}>{value}</Text>
            </View>
          ))}
        </View>

        <Link href="/" asChild>
          <Pressable accessibilityRole="button" style={styles.button}>
            <Text style={styles.buttonText}>Back to shell</Text>
          </Pressable>
        </Link>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#0b1119" },
  content: { gap: 16, padding: 16 },
  note: { color: "#aebdca", fontSize: 13, lineHeight: 19 },
  table: { overflow: "hidden", borderRadius: 14, backgroundColor: "#152234" },
  row: { gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#30445a", padding: 13 },
  label: { color: "#7fa9d6", fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  value: { color: "#f3f7fb", fontSize: 14 },
  button: { alignItems: "center", borderRadius: 10, backgroundColor: "#dae8f5", paddingVertical: 12 },
  buttonText: { color: "#102033", fontWeight: "700" },
});
