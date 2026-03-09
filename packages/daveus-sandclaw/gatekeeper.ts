import { startGatekeeper } from "@sandclaw/gatekeeper";
import { plugins } from "./plugins";
import { gatekeeperConfig } from "./config";

startGatekeeper({
  plugins,
  config: gatekeeperConfig,
});
