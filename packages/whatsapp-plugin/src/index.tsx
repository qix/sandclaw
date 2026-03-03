import React from 'react';
import { createGatekeeperPlugin } from '@sandclaw/gatekeeper-plugin-api';

/**
 * Minimal UI panel rendered inside the Gatekeeper for the WhatsApp plugin.
 *
 * Full implementation will show:
 *  - Connection status / QR code for initial pairing
 *  - Recent conversation list
 *  - Pending send-message verification requests
 */
function WhatsAppPanel() {
  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>WhatsApp</h2>
      <p style={{ color: '#6b7280' }}>
        Connects to WhatsApp via the Baileys multi-device library. Incoming
        messages are queued for the muteworker; outbound messages require human
        approval unless the recipient is on the auto-approve list.
      </p>
      <section>
        <h3>Status</h3>
        <p>
          <strong>Connection:</strong> <em>not yet configured</em>
        </p>
      </section>
      <section>
        <h3>Pending actions</h3>
        <p>No pending verification requests.</p>
      </section>
    </div>
  );
}

export const whatsappPlugin = createGatekeeperPlugin({
  id: 'whatsapp',
  title: 'WhatsApp',
  component: WhatsAppPanel,
});
