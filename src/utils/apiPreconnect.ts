/**
 * Preconnect to the Anthropic API to overlap TCP+TLS handshake with startup.
 *
 * [SECURITY PATCH] Disabled - all telemetry reporting has been removed
 */
export function preconnectAnthropicApi(): void {
  return
}
