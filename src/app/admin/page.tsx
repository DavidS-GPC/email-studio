import { redirect } from "next/navigation";
import { requireSessionIdentity } from "@/lib/routeAuth";
import AdminUsersManager from "@/components/AdminUsersManager";

export default async function AdminPage() {
  const result = await requireSessionIdentity();
  if (result.error) {
    redirect("/signin");
  }

  if (result.identity.appRole !== "admin") {
    redirect("/");
  }

  return <AdminUsersManager />;
}
