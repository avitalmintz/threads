import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import {
  consumeStateCookie,
  getAuthCookies,
  setAuthCookies,
} from "@/lib/auth";
import { exchangeCodeForTokens } from "@/lib/spotify";

export async function GET(request: NextRequest) {
  // Browsers (and Next.js dev tooling) sometimes hit the callback URL twice
  // in quick succession — prefetch, double-render, etc. The first hit
  // consumes the state cookie; without this guard, the second hit fails
  // state validation and bounces a successfully-authed user back to /.
  // If we already have auth cookies, this is a duplicate — just go through.
  const existing = await getAuthCookies();
  if (existing) redirect("/dashboard");

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    redirect(`/?auth_error=${encodeURIComponent(error)}`);
  }

  const expectedState = await consumeStateCookie();
  if (!code || !state || !expectedState || state !== expectedState) {
    redirect("/?auth_error=state_mismatch");
  }

  const tokens = await exchangeCodeForTokens(code!);
  await setAuthCookies(tokens);

  redirect("/dashboard");
}
