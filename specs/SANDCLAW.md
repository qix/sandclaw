# Sandclaw

## Project overview

SandClaw is a human-in-the-loop safety framework for AI agents. It separates safe operations (processing data that may contain prompt injections) from dangerous operations (actions that have the potential to take actions or leak secrets).

It contains three major components:

- The **gatekeeper**: The web ui and primary backend. The gatekeeper provides an interface for the operator to accept or reject any actions, maintains connections to any chat channels, and controls all the secrets.
- The **muteworker**: The primary agent, it's responsible for performing the bulk of the work. It has no direct internet access, and the only external actions it can take are via API calls to the gatekeeper.
- The **confidante** performs all operations that touch both private data and public interfaces. It can run an agent, but one that is fully sandboxed and has explicit instructions to only operate on trusted websites.
