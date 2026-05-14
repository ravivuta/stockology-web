import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { PortfolioCloudBridge } from "@/components/PortfolioCloudBridge";
import { snapshotIndicatesExistingAccount } from "@/lib/cloud-portfolio";
import { syncStocksPmAuthUser, touchStocksPmLastAppOpen } from "@/lib/stocks-pm-account";
import { getSubscriptionRowForUser } from "@/lib/subscription-admin";
import { ensureUserHasWebTrial } from "@/lib/billing";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let user = null;
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    redirect("/login");
  }
  if (!user) redirect("/login");

  const dataUserId = await syncStocksPmAuthUser(supabase, user.id);

  // Run all independent operations in parallel — trial check, open-touch, subscription, and snapshot
  const [, , subRow, snapRes] = await Promise.all([
    ensureUserHasWebTrial(dataUserId),
    touchStocksPmLastAppOpen(supabase, dataUserId, "web"),
    getSubscriptionRowForUser(dataUserId),
    // Holdings are AES-256-CBC encrypted at rest; must read via RPC which decrypts server-side.
    supabase.rpc("get_latest_portfolio_snapshot", { p_user_id: dataUserId }),
  ]);
  const latestSnapshot = snapRes.data as { holdings: unknown; cash_balance: unknown; total_portfolio_value: unknown } | null;
  const snapErr = snapRes.error;

  let hasCloudPortfolio = false;
  if (!snapErr && latestSnapshot) {
    hasCloudPortfolio = snapshotIndicatesExistingAccount(latestSnapshot);
  }

  return (
    <>
      <PortfolioCloudBridge authUserId={user.id} dataUserId={dataUserId} cloudSnapshot={latestSnapshot ?? null} />
      <AppShell
        user={user}
        dataUserId={dataUserId}
        serverSubscription={subRow ?? null}
        hasCloudPortfolio={hasCloudPortfolio}
      >
        {children}
      </AppShell>
    </>
  );
}
