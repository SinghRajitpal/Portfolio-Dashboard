export type FixtureRoute = {
  match: RegExp
  fixture: string
  status?: number
  contentType?: string
}

let originalFetch: typeof globalThis.fetch | null = null

export function installFetchMock(routes: FixtureRoute[]): void {
  originalFetch = globalThis.fetch
  globalThis.fetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
    for (const r of routes) {
      if (r.match.test(url)) {
        const fs = await import('node:fs/promises')
        const path = await import('node:path')
        const body = await fs.readFile(
          path.join(process.cwd(), 'tests/fixtures', r.fixture),
          'utf-8'
        )
        return new Response(body, {
          status: r.status ?? 200,
          headers: { 'Content-Type': r.contentType ?? 'application/json' },
        })
      }
    }
    throw new Error(`mock-fetch: no fixture matched ${url}`)
  }
}

export function uninstallFetchMock(): void {
  if (originalFetch) {
    globalThis.fetch = originalFetch
    originalFetch = null
  }
}
