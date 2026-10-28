import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Application entry point for every dedicated TradesStack workspace.
 *
 * The customer application does not serve the public TradesStack marketing
 * landing page. Signed-in users continue to their authorised default route and
 * everyone else is sent to sign in. Resolving this on the server avoids a flash
 * of marketing content or an intermediate loading screen.
 */
export default async function HomePage() {
  let isAuthenticated = false;

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    isAuthenticated = Boolean(user);
  } catch {
    // A missing Supabase configuration or an unreadable session is treated as
    // signed out; the login page renders the single supported entry form.
    isAuthenticated = false;
  }

  redirect(isAuthenticated ? "/app/dashboard" : "/login");
}
