import { confidanteScript } from "@sandclaw/confidante";
import { plugins } from "./plugins";
import { confidanteConfig } from "./config";

confidanteScript({
  plugins,
  config: confidanteConfig,
});
