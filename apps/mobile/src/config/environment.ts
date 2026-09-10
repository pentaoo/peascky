import Constants from "expo-constants";

export type AppVariant = "development" | "preview" | "production";

export type MobileEnvironment = Readonly<{
  appVariant: AppVariant;
  applicationId: string;
  identifierStatus: "repository-stable-placeholder";
}>

const APP_VARIANTS = new Set<AppVariant>(["development", "preview", "production"]);

function configuredExtra(): Record<string, unknown> {
  const extra = Constants.expoConfig?.extra;
  return extra && typeof extra === "object" ? extra : {};
}

export function readMobileEnvironment(): MobileEnvironment {
  const extra = configuredExtra();
  const appVariant = extra.appVariant;
  const applicationId = extra.applicationId;
  const identifierStatus = extra.identifierStatus;

  if (typeof appVariant !== "string" || !APP_VARIANTS.has(appVariant as AppVariant)) {
    throw new Error("Expo config is missing a supported appVariant");
  }
  if (typeof applicationId !== "string" || applicationId.length === 0) {
    throw new Error("Expo config is missing applicationId");
  }
  if (identifierStatus !== "repository-stable-placeholder") {
    throw new Error("Expo config has an unsupported identifierStatus");
  }

  return {
    appVariant: appVariant as AppVariant,
    applicationId,
    identifierStatus,
  };
}
