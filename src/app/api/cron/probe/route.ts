// Probe route — DO NOT DELETE: tests/integration/data/proxy-cron-bypass.spec.ts depends on this
import type { NextRequest } from 'next/server'

export function GET(request: NextRequest) {
  return Response.json({
    ok: true,
    ua: request.headers.get('user-agent'),
  })
}
