# oma-verification

This console is adapted for validating an on-premise OpenMA deployment using the Anthropic SDK wire-compatible endpoint.

## Quick start

1. Export your OpenMA endpoint and credentials:
   - OPENMA_BASE_URL
   - OPENMA_API_KEY
   - OPENMA_ENVIRONMENT_ID
   - OPENMA_ENVIRONMENT_KEY  # optional for local subprocess mode
2. Start the verification console:
   - npm run exp:openma-console
3. Start the local dashboard service when you want to inspect sessions and sandboxes:
   - npm run dev

The console uses the same API surface as Claude Managed Agents, but points the SDK at your OpenMA base URL through the configurable base URL setting.

## OpenMA-specific sandbox behavior

This project is now designed for OpenMA only.

- sandbox startup is handled by the OpenMA server itself in subprocess mode,
- this project does not launch a separate OpenShell-based sandbox image,
- and it does not rely on a CMA-style poll loop for sandbox orchestration.

The sandbox mode is fixed to OpenMA-style subprocess handling with local subprocess tool execution.