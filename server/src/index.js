import { createApp } from "./app.js";
import { config, validateConfig } from "./config.js";

// Fail fast: refuse to boot without PayWay credentials.
validateConfig();

const app = createApp();

// Warn (don't block) when pointed at the real production gateway.
function environmentWarning() {
  if (config.isProduction) {
    return "PRODUCTION gateway - payments move REAL money.";
  }
  return `sandbox (${config.paywayBaseUrl})`;
}

app.listen(config.port, () => {
  console.log(
    `[khqr-mart] server listening on http://localhost:${config.port} ` +
      `(merchant: ${config.paywayMerchantId}, ` +
      `webhook: ${config.paywayCallbackUrl ? "configured" : "off"})`
  );
  console.log(`[khqr-mart] PayWay environment: ${environmentWarning()}`);
});
