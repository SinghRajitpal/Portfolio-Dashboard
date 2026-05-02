import { describe, it, expect, afterEach } from 'vitest'
import { installFetchMock, uninstallFetchMock } from '../helpers/mock-fetch'

describe('mock-fetch helper', () => {
  afterEach(() => {
    uninstallFetchMock()
  })

  it('serves fixture data for matched URL pattern', async () => {
    installFetchMock([
      {
        match: /openfigi/,
        fixture: 'openfigi/chdvd-isin.json',
      },
    ])

    const response = await fetch('https://api.openfigi.com/v3/mapping')
    expect(response.status).toBe(200)

    const data = await response.json()
    // chdvd-isin.json is an array with one element containing a 'data' array
    expect(data[0].data[0].ticker).toBe('CHDVD')
  })

  it('throws for unmatched URLs', async () => {
    installFetchMock([
      {
        match: /openfigi/,
        fixture: 'openfigi/chdvd-isin.json',
      },
    ])

    await expect(fetch('https://example.com/unmatched')).rejects.toThrow(
      'mock-fetch: no fixture matched https://example.com/unmatched'
    )
  })

  it('uninstalls cleanly and restores original fetch', async () => {
    const originalFetch = globalThis.fetch
    installFetchMock([])
    expect(globalThis.fetch).not.toBe(originalFetch)
    uninstallFetchMock()
    expect(globalThis.fetch).toBe(originalFetch)
  })
})
