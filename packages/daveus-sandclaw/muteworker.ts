import { muteworkerScript } from "@sandclaw/muteworker";
import { plugins } from "./plugins";
import { muteworkerConfig } from "./config";

muteworkerScript({
  plugins,
  config: muteworkerConfig,
});
