import { createClient } from "@/lib/supabase/server";
import { Landing } from "@/components/Landing";

export default async function Home() {
  let hasSession = false;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    hasSession = !!user;
  } catch {
    hasSession = false;
  }
  return <Landing hasSession={hasSession} />;
}
