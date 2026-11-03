import { isSameSitePath } from "@/lib/account/routes";

// Middleware rewrites here instead of redirecting directly. Next.js normalizes 127.0.0.1 to
// localhost in middleware redirect URLs, which would strand cookies set on 127.0.0.1.
// A route handler can send a relative Location, so the browser keeps its host.
export function GET(request: Request) {
  const to = new URL(request.url).searchParams.get("to");
  const location = to && isSameSitePath(to) ? to : "/login";
  return new Response(null, {
    status: 307,
    headers: { Location: location, "Cache-Control": "private, no-store, max-age=0" },
  });
}
