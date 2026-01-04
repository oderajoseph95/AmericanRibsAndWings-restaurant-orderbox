import { Outlet } from 'react-router-dom';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { NotificationPermissionPrompt } from '@/components/admin/NotificationPermissionPrompt';
import { TooltipProvider } from '@/components/ui/tooltip';

export default function AdminLayout() {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <div className="min-h-screen flex w-full">
          <AdminSidebar />
          <SidebarInset className="flex-1">
            <main className="p-6">
              <AdminHeader />
              <NotificationPermissionPrompt />
              <Outlet />
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
}
