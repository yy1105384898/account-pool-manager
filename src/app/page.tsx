import DashboardClient from "@/app/dashboard-client";
import { getDashboardData } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export default function Home() {
  const data = getDashboardData();
  return <DashboardClient data={data} />;
}
