import pino from "pino";

export const logger = pino({
  name: "gatekeeper",
  transport: {
    target: "pino-pretty",
  },
});
