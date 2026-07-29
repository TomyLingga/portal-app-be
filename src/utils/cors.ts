const LOOPBACK_HOST_ALIASES: Record<string, string> = {
  localhost: '127.0.0.1',
  '127.0.0.1': 'localhost',
}

export function expandDevelopmentLoopbackOrigins(
  origins: Iterable<string>,
  nodeEnv: string,
): Set<string> {
  const allowedOrigins = new Set(origins)
  if (nodeEnv === 'production') return allowedOrigins

  for (const origin of allowedOrigins) {
    try {
      const url = new URL(origin)
      const alias = LOOPBACK_HOST_ALIASES[url.hostname]
      if (!alias) continue

      url.hostname = alias
      allowedOrigins.add(url.origin)
    } catch {
      // Invalid configured origins remain untouched and will never match a URL origin.
    }
  }

  return allowedOrigins
}
