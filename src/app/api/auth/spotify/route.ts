import { redirect } from "next/navigation";
import { setStateCookie } from "@/lib/auth";
import { buildAuthorizeUrl } from "@/lib/spotify";

export async function GET() {
  const state = crypto.randomUUID();
  await setStateCookie(state);
  redirect(buildAuthorizeUrl(state));
}
