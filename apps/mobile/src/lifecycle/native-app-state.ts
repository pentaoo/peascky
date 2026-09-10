import { AppState, type AppStateStatus } from "react-native";
import type {
  AppLifecycleState,
  AppStateSource,
  AppStateSubscription,
} from "./lifecycle-coordinator";

function normalizeAppState(state: AppStateStatus): AppLifecycleState {
  if (state === "active" || state === "background") return state;
  return "inactive";
}

export function createNativeAppStateSource(): AppStateSource {
  return {
    current: () => normalizeAppState(AppState.currentState),
    subscribe(listener): AppStateSubscription {
      const subscription = AppState.addEventListener("change", (nextState) => {
        listener(normalizeAppState(nextState));
      });
      return { remove: () => subscription.remove() };
    },
  };
}
