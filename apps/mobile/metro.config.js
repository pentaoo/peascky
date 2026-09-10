const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);
const portablePackagesRoot = `${path.resolve(__dirname, "../../packages")}${path.sep}`;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  try {
    return context.resolveRequest(context, moduleName, platform);
  } catch (error) {
    const isPortableSource = context.originModulePath.startsWith(portablePackagesRoot);
    const isEmittedEsmSpecifier = moduleName.startsWith(".") && moduleName.endsWith(".js");
    if (isPortableSource && isEmittedEsmSpecifier) {
      return context.resolveRequest(context, moduleName.slice(0, -3), platform);
    }
    throw error;
  }
};

module.exports = config;
