import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { createNativeAppStateSource } from "../lifecycle/native-app-state";
import {
  PocketJamApplicationRuntime,
  type ApplicationRuntimeSnapshot,
} from "./application-runtime";

const ApplicationRuntimeContext = createContext<PocketJamApplicationRuntime | null>(null);

export function ApplicationCompositionRoot({ children }: PropsWithChildren): React.JSX.Element {
  const runtimeRef = useRef<PocketJamApplicationRuntime | null>(null);
  if (!runtimeRef.current) {
    runtimeRef.current = new PocketJamApplicationRuntime(createNativeAppStateSource());
  }
  const runtime = runtimeRef.current;

  useEffect(() => {
    runtime.start();
    return () => runtime.dispose();
  }, [runtime]);

  return (
    <ApplicationRuntimeContext.Provider value={runtime}>
      {children}
    </ApplicationRuntimeContext.Provider>
  );
}

export function useApplicationRuntime(): PocketJamApplicationRuntime {
  const runtime = useContext(ApplicationRuntimeContext);
  if (!runtime) throw new Error("Application runtime is outside its composition root");
  return runtime;
}

export function useApplicationSnapshot(): ApplicationRuntimeSnapshot {
  const runtime = useApplicationRuntime();
  return useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
}
