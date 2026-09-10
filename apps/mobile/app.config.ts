import type { ConfigContext, ExpoConfig } from "expo/config";

type AppVariant = "development" | "preview" | "production";

const VARIANTS: Record<AppVariant, Readonly<{
  displayName: string;
  scheme: string;
  iosBundleIdentifier: string;
  androidPackage: string;
}>> = {
  development: {
    displayName: "Pocket Jam Dev",
    scheme: "pocket-jam-dev",
    iosBundleIdentifier: "com.pocketjam.mobile.dev",
    androidPackage: "com.pocketjam.mobile.dev",
  },
  preview: {
    displayName: "Pocket Jam Preview",
    scheme: "pocket-jam-preview",
    iosBundleIdentifier: "com.pocketjam.mobile.preview",
    androidPackage: "com.pocketjam.mobile.preview",
  },
  production: {
    displayName: "Pocket Jam",
    scheme: "pocket-jam",
    iosBundleIdentifier: "com.pocketjam.mobile",
    androidPackage: "com.pocketjam.mobile",
  },
};

function readVariant(value: string | undefined): AppVariant {
  if (value === undefined || value === "development") return "development";
  if (value === "preview" || value === "production") return value;
  throw new Error(`APP_VARIANT must be development, preview, or production; received ${value}`);
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const appVariant = readVariant(process.env.APP_VARIANT);
  const variant = VARIANTS[appVariant];

  return {
    ...config,
    name: variant.displayName,
    slug: "pocket-jam-mobile",
    version: "0.1.0",
    platforms: ["ios", "android"],
    scheme: variant.scheme,
    ios: {
      bundleIdentifier: variant.iosBundleIdentifier,
      supportsTablet: false,
    },
    android: {
      package: variant.androidPackage,
    },
    plugins: ["expo-router"],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      appVariant,
      applicationId: variant.androidPackage,
      identifierStatus: "repository-stable-placeholder",
    },
  };
};
