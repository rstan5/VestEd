import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { routeDecision } from "@/lib/account/routes";
import type { Database } from "./database";
import { supabaseEnv } from "./env";

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  let signedIn = false;
  const env = supabaseEnv();

  if (env) {
    const supabase = createServerClient<Database>(env.url, env.key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list, headers) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
          for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
        },
      },
    });
    try {
      // getUser validates the token with Auth instead of trusting the cookie payload.
      const { data } = await supabase.auth.getUser();
      signedIn = Boolean(data.user);
    } catch {
      signedIn = false;
    }
  }

  const decision = routeDecision(request.nextUrl.pathname, request.nextUrl.search, signedIn);
  if (decision.kind === "next") return response;

  // See src/app/auth/redirect/route.ts for why this is a rewrite and not a redirect.
  const target = request.nextUrl.clone();
  target.pathname = "/auth/redirect";
  target.search = `?to=${encodeURIComponent(decision.to)}`;
  const rewrite = NextResponse.rewrite(target);
  for (const cookie of response.cookies.getAll()) rewrite.cookies.set(cookie);
  for (const key of ["cache-control", "expires", "pragma"]) {
    const value = response.headers.get(key);
    if (value) rewrite.headers.set(key, value);
  }
  return rewrite;
}
