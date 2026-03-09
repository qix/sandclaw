import { parseArgs } from "node:util";
import { muteworkerScript } from "@sandclaw/muteworker-claude";
import { plugins } from "./plugins";
import { muteworkerConfig } from "./config";

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

muteworkerScript({
  plugins,
  config: muteworkerConfig,
  replayJobId: replay,
});
