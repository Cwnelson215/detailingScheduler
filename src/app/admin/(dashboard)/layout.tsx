import Link from "next/link";
import { Calendar, ClipboardList, LayoutDashboard, Settings, Wrench } from "lucide-react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white p-4 flex flex-col shrink-0">
        <Link href="/admin" className="text-lg font-bold mb-8 px-2">
          Admin Panel
        </Link>
        <nav className="space-y-1 flex-1">
          <NavLink href="/admin" icon={<LayoutDashboard className="h-4 w-4" />}>
            Dashboard
          </NavLink>
          <NavLink href="/admin/bookings" icon={<ClipboardList className="h-4 w-4" />}>
            Bookings
          </NavLink>
          <NavLink href="/admin/services" icon={<Wrench className="h-4 w-4" />}>
            Services
          </NavLink>
          <NavLink href="/admin/schedule" icon={<Calendar className="h-4 w-4" />}>
            Schedule
          </NavLink>
          <NavLink href="/admin/settings" icon={<Settings className="h-4 w-4" />}>
            Settings
          </NavLink>
        </nav>
        <Link
          href="/"
          className="text-sm text-slate-400 hover:text-white transition-colors px-2 py-1"
        >
          View Site
        </Link>
      </aside>

      {/* Main content */}
      <main className="flex-1 bg-muted p-8 overflow-auto">{children}</main>
    </div>
  );
}

function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
    >
      {icon}
      {children}
    </Link>
  );
}
