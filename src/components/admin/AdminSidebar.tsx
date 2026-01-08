import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  FolderTree,
  Flame,
  Layers,
  BoxesIcon,
  Users,
  BarChart3,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Globe,
  Truck,
  Wallet,
  FileText,
  UserCog,
  Mail,
  Crown,
  MessageSquare,
} from 'lucide-react';

const navItems = [
  { title: 'Dashboard', url: '/admin', icon: LayoutDashboard, roles: ['owner', 'manager', 'cashier'] },
  { title: 'Orders', url: '/admin/orders', icon: ShoppingCart, roles: ['owner', 'manager', 'cashier'] },
  { title: 'Products', url: '/admin/products', icon: Package, roles: ['owner', 'manager', 'cashier'] },
  { title: 'Categories', url: '/admin/categories', icon: FolderTree, roles: ['owner', 'manager', 'cashier'] },
  { title: 'Flavors', url: '/admin/flavors', icon: Flame, roles: ['owner', 'manager', 'cashier'] },
  { title: 'Bundles & Rules', url: '/admin/bundles', icon: Layers, roles: ['owner', 'manager', 'cashier'] },
  { title: 'Stock', url: '/admin/stock', icon: BoxesIcon, roles: ['owner', 'manager', 'cashier'] },
  { title: 'Customers', url: '/admin/customers', icon: Users, roles: ['owner', 'manager', 'cashier'] },
  { title: 'Drivers', url: '/admin/drivers', icon: Truck, roles: ['owner', 'manager'] },
  { title: 'Payouts', url: '/admin/payouts', icon: Wallet, roles: ['owner', 'manager'] },
  { title: 'Reports', url: '/admin/reports', icon: BarChart3, roles: ['owner', 'manager'] },
  { title: 'Website', url: '/admin/website', icon: Globe, roles: ['owner', 'manager'] },
  { title: 'Email Templates', url: '/admin/email-templates', icon: Mail, roles: ['owner', 'manager'] },
  { title: 'SMS', url: '/admin/sms', icon: MessageSquare, roles: ['owner', 'manager'] },
  { title: 'Users', url: '/admin/users', icon: UserCog, roles: ['owner'] },
  { title: 'Activity Logs', url: '/admin/logs', icon: FileText, roles: ['owner', 'manager'] },
  { title: 'Settings', url: '/admin/settings', icon: Settings, roles: ['owner'] },
];

export function AdminSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { role, signOut, username, displayName, isSuperOwner } = useAuth();
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === 'collapsed';

  const visibleItems = navItems.filter(
    (item) => role && item.roles.includes(role)
  );

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-sidebar-primary rounded-lg flex items-center justify-center flex-shrink-0">
            <Flame className="w-5 h-5 text-sidebar-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-sm truncate text-sidebar-foreground">
                American Ribs
              </h2>
              <p className="text-xs text-sidebar-foreground/60 truncate">
                Admin Panel
              </p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50">
            {!collapsed && 'Menu'}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => {
                const isActive = location.pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={collapsed ? item.title : undefined}
                    >
                      <button
                        onClick={() => navigate(item.url)}
                        className="w-full flex items-center gap-3"
                      >
                        <item.icon className="w-5 h-5 flex-shrink-0" />
                        {!collapsed && <span>{item.title}</span>}
                      </button>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 space-y-3">
        {!collapsed && (
          <div className="px-2 py-2 rounded-lg bg-sidebar-accent">
            <div className="flex items-center gap-1.5">
              <p className="text-sm text-sidebar-accent-foreground truncate font-medium">
                {displayName || username || 'No name'}
              </p>
              {isSuperOwner && (
                <Crown className="w-3 h-3 text-amber-500 flex-shrink-0" />
              )}
            </div>
            <p className="text-[10px] text-muted-foreground font-mono truncate">
              @{username || 'no_username'}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-xs font-medium text-sidebar-accent-foreground capitalize">
                {role}
              </p>
              {isSuperOwner && (
                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 bg-amber-500/10 text-amber-600 border-amber-500/30">
                  Super
                </Badge>
              )}
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="text-sidebar-foreground hover:bg-sidebar-accent"
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </Button>
          {!collapsed && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="flex-1 text-sidebar-foreground hover:bg-sidebar-accent"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          )}
          {collapsed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSignOut}
              className="text-sidebar-foreground hover:bg-sidebar-accent"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
