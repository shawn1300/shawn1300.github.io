import "server-only";

import { createAdminSupabase, createServerSupabase } from "./server";

/**
 * Verifies the current Supabase session before returning a cookie-free
 * Service Role client for trusted Route Handler mutations.
 */
export async function createAuthenticatedAdminContext() {
  const authClient = await createServerSupabase();
  const {
    data: { user },
    error,
  } = await authClient.auth.getUser();

  if (error || !user) return null;

  return {
    user,
    supabase: createAdminSupabase(),
  };
}
