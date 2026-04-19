import React from "react";
import { gatekeeperDeps, TabLink } from "@sandclaw/gatekeeper-plugin-api";
import type { PluginEnvironment } from "@sandclaw/gatekeeper-plugin-api";
import { muteworkerDeps } from "@sandclaw/muteworker-plugin-api";
import type { MuteworkerEnvironment } from "@sandclaw/muteworker-plugin-api";
import { wamState } from "./state";
import {
  connectMqtt,
  disconnectMqtt,
  loadRecentConversations,
} from "./connection";
import { WhatsAppMqttPanel, WhatsAppMqttVerificationRenderer } from "./components";
import { registerRoutes, deliverMessage } from "./routes";
import { migrations } from "./migrations";
import { createSendWhatsappMqttTool } from "./tools";
import { createWhatsappMqttJobHandlers } from "./jobHandlers";
import { WhatsAppMqttStatusContext, useWhatsAppMqttStatus } from "./statusContext";

export type { WhatsAppMqttState, ConnectionStatus } from "./state";
export { WhatsAppMqttPanel, WhatsAppMqttVerificationRenderer } from "./components";
export { WhatsAppMqttStatusContext, useWhatsAppMqttStatus } from "./statusContext";
export { createSendWhatsappMqttTool } from "./tools";

export interface WhatsappMqttPluginOptions {
  /** MQTT broker URL (e.g. 'mqtt://192.168.1.100:1883'). Defaults to MQTT_URL env var or 'mqtt://localhost:1883'. */
  mqttUrl?: string;

  /** MQTT username. Defaults to MQTT_USER env var. */
  mqttUser?: string;

  /** MQTT password. Defaults to MQTT_PASSWORD env var. */
  mqttPassword?: string;

  /** MQTT topic the bridge publishes incoming WhatsApp messages to. Defaults to MQTT_TOPIC_INCOMING env var or 'whatsapp/incoming'. */
  topicIncoming?: string;

  /** MQTT topic to publish outgoing messages for the bridge to send. Defaults to MQTT_TOPIC_OUTGOING env var or 'whatsapp/outgoing'. */
  topicOutgoing?: string;

  /** JIDs that are trusted operators. Incoming messages from non-operator JIDs are
   *  ignored; sends to operator JIDs are auto-approved without human verification. */
  operatorJids?: string[];

  /** Only process messages from the operator through the agent. */
  operatorOnly?: boolean;

  /** Model ID to use for processing incoming messages (e.g. 'claude-sonnet-4-6').
   *  Set to 'none' to log messages without LLM processing. */
  modelId?: string;
}

export function buildWhatsappMqttPlugin(
  options: WhatsappMqttPluginOptions = {},
) {
  const mqttUrl = options.mqttUrl ?? process.env.MQTT_URL ?? "mqtt://localhost:1883";
  const mqttUser = options.mqttUser ?? process.env.MQTT_USER;
  const mqttPassword = options.mqttPassword ?? process.env.MQTT_PASSWORD;
  const topicIncoming = options.topicIncoming ?? process.env.MQTT_TOPIC_INCOMING ?? "whatsapp/incoming";
  const topicOutgoing = options.topicOutgoing ?? process.env.MQTT_TOPIC_OUTGOING ?? "whatsapp/outgoing";
  const operatorJids: ReadonlySet<string> = new Set(options.operatorJids ?? []);
  const operatorOnly = options.operatorOnly ?? false;
  const modelId = options.modelId;

  return {
    id: "whatsapp-mqtt" as const,
    verificationRenderer: WhatsAppMqttVerificationRenderer,
    migrations,

    jobHandlers: createWhatsappMqttJobHandlers(operatorJids, modelId),

    registerGateway(env: PluginEnvironment) {
      env.registerInit({
        deps: {
          db: gatekeeperDeps.db,
          hooks: gatekeeperDeps.hooks,
          components: gatekeeperDeps.components,
          routes: gatekeeperDeps.routes,
          verifications: gatekeeperDeps.verifications,
        },
        async init({ db, hooks, components, routes, verifications }) {
          function WhatsAppMqttTab() {
            const { statusColor } = useWhatsAppMqttStatus();
            return (
              <TabLink
                href="?page=whatsapp-mqtt"
                title="WhatsApp (MQTT)"
                statusColor={statusColor}
              />
            );
          }

          function WhatsAppMqttProvider({
            children,
          }: {
            children: React.ReactNode;
          }) {
            const statusColor = (() => {
              switch (wamState.connectionStatus) {
                case "connected":
                  return "green" as const;
                case "connecting":
                  return "yellow" as const;
                case "disconnected":
                default:
                  return "red" as const;
              }
            })();
            return (
              <WhatsAppMqttStatusContext.Provider value={{ statusColor }}>
                {children}
              </WhatsAppMqttStatusContext.Provider>
            );
          }

          components.register("tabs:channels", WhatsAppMqttTab);
          components.register("page:whatsapp-mqtt", WhatsAppMqttPanel);
          components.register("provider", WhatsAppMqttProvider);

          routes.registerRoutes((app) =>
            registerRoutes(app, db, topicOutgoing, operatorJids, verifications),
          );

          verifications.registerVerificationCallback(async (request) => {
            await deliverMessage(db, topicOutgoing, request.data.jid, request.data.text);
          });

          hooks.register({
            "gatekeeper:start": async () => {
              await loadRecentConversations(db);
              await connectMqtt(db, {
                mqttUrl,
                mqttUser,
                mqttPassword,
                topicIncoming,
                topicOutgoing,
                operatorOnly,
                operatorJids,
                modelId,
              });
            },
            "gatekeeper:stop": () => disconnectMqtt(),
          });
        },
      });
    },

    registerMuteworker(env: MuteworkerEnvironment) {
      env.registerInit({
        deps: { tools: muteworkerDeps.tools },
        init({ tools }) {
          tools.registerTools((ctx) => [createSendWhatsappMqttTool(ctx)]);
        },
      });
    },
  };
}

/** Default plugin instance (no configuration). */
export const whatsappMqttPlugin = buildWhatsappMqttPlugin();
