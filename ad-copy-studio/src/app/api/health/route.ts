// Uptime check for the host. Reveals nothing about the data.
export const dynamic = 'force-dynamic';
export function GET() { return Response.json({ ok: true }); }
