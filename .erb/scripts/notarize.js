const { build } = require("../../package.json");

exports.default = async function notarizeMacos(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== "darwin") {
    return;
  }

  if (process.env.CI !== "true") {
    console.warn("Skipping notarizing step. Packaging is not running in CI");
    return;
  }

  if (!(
    process.env.CSC_LINK &&
    process.env.CSC_KEY_PASSWORD &&
    process.env.APPLE_ID &&
    process.env.APPLE_ID_PASS &&
    process.env.APPLE_TEAM_ID
  )) {
    console.warn(
      "Skipping notarizing step. Signing and Apple notarization credentials must be set",
    );
    return;
  }

  const appName = context.packager.appInfo.productFilename;

  const { notarize } = await import("@electron/notarize");
  await notarize({
    tool: "notarytool",
    appBundleId: build.appId,
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_ID_PASS,
    teamId: process.env.APPLE_TEAM_ID,
  });
};
