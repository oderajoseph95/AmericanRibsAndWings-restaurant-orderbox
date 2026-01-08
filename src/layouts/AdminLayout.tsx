import { Outlet } from 'react-router-dom';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { NotificationPermissionPrompt } from '@/components/admin/NotificationPermissionPrompt';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Menu } from 'lucide-react';

export default function AdminLayout() {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <div className="min-h-screen flex w-full">
          <AdminSidebar />
          <SidebarInset className="flex-1 flex flex-col min-w-0">
            {/* Mobile Header - Only visible on mobile/tablet */}
            <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-background px-4 md:hidden">
              <SidebarTrigger className="h-9 w-9 flex items-center justify-center">
                <Menu className="h-5 w-5" />
              </SidebarTrigger>
              <span className="font-semibold text-foreground">Admin Panel</span>
            </header>
            
            <main className="flex-1 p-4 md:p-6 overflow-x-hidden">
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
