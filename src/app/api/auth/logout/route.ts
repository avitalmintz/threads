import { redirect } from "next/navigation";
import { clearAuthCookies } from "@/lib/auth";

export async function GET() {
  await clearAuthCookies();
  redirect("/");
}

export async function POST() {
  await clearAuthCookies();
  redirect("/");
}
