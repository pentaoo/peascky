export type DiagnosticDetails = Readonly<Record<string, string | number | boolean | null>>;

export interface DevelopmentLogger {
  info(message: string, details?: DiagnosticDetails): void;
}

export function createDevelopmentLogger(enabled: boolean): DevelopmentLogger {
  return {
    info(message, details) {
      if (!enabled) return;
      if (details) {
        console.info(`[Pocket Jam] ${message}`, details);
      } else {
        console.info(`[Pocket Jam] ${message}`);
      }
    },
  };
}
