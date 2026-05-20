import { BusinessInfoForm } from "@/components/admin/business-info-form";
import { ChangePasswordForm } from "@/components/admin/change-password-form";
import { getBusinessInfo } from "@/lib/business-info";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const info = await getBusinessInfo();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <div className="flex flex-wrap gap-6">
        <BusinessInfoForm initial={info} />
        <ChangePasswordForm />
      </div>
    </div>
  );
}
