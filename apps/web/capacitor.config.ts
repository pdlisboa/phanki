import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.phanki.app',
  appName: 'Phanki',
  webDir: 'dist',
  android: {
    // Lets the app talk to a plain-http server on the LAN (e.g. Portainer without TLS).
    allowMixedContent: true,
  },
}

export default config
