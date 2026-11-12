import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "energy.voltra.app",
  appName: "VOLTRA",
  webDir: ".output/public",
  android: {
    allowMixedContent: true,
    backgroundColor: "#0b0d0c",
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      backgroundColor: "#0b0d0c",
      style: "DARK",
    },
    SplashScreen: {
      launchShowDuration: 1400,
      launchAutoHide: true,
      backgroundColor: "#0b0d0c",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
  },
};

export default config;
