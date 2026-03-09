import { parseArgs } from "node:util";
import { confidanteScript } from "@sandclaw/confidante";
import { plugins } from "./plugins";
import { confidanteConfig } from "./config";

const { values } = parseArgs({
  options: {
    replay: { type: "string" },
  },
  strict: false,
});

const replay =
  typeof values.replay === "string" ? parseInt(values.replay, 10) : undefined;
if (values.replay !== undefined && (replay == null || isNaN(replay))) {
  console.error("Error: --replay requires a numeric job ID.");
  process.exit(1);
}

confidanteScript({
  plugins,
  config: confidanteConfig,
  replayJobId: replay,
});
