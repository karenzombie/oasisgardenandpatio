import {
  LayoutDashboard,
  ClipboardList,
  Truck,
  Users,
  Package,
  Tags,
  Layers,
  Boxes,
  Building2,
  Send,
  Percent,
  Megaphone,
  FileText,
  BarChart3,
  Settings,
  History,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
};

export type NavGroup = {
  heading: string;
  items: NavItem[];
};

export const ADMIN_NAV: NavGroup[] = [
  {
    heading: "Overview",
    items: [
      { label: "Dashboard", path: "/admin", icon: LayoutDashboard },
      { label: "Notifications", path: "/admin/notifications", icon: ClipboardList },
    ],
  },
  {
    heading: "Sales",
    items: [
      { label: "Orders", path: "/admin/orders", icon: ShoppingCart },
      { label: "Vendor Orders", path: "/admin/vendor-orders", icon: Send },
      { label: "Cushion Orders", path: "/admin/cushion-orders", icon: Layers },
      { label: "Customers", path: "/admin/customers", icon: Users },
      { label: "Discounts", path: "/admin/discounts", icon: Percent },
    ],
  },
  {
    heading: "Catalog",
    items: [
      { label: "Products", path: "/admin/products", icon: Package },
      { label: "Categories", path: "/admin/categories", icon: Tags },
      { label: "Sets", path: "/admin/sets", icon: Layers },
      { label: "Inventory", path: "/admin/inventory", icon: Boxes },
      { label: "Manufacturers", path: "/admin/manufacturers", icon: Building2 },
      { label: "Carriers", path: "/admin/carriers", icon: Truck },
    ],
  },
  {
    heading: "Site",
    items: [
      { label: "Banners", path: "/admin/banners", icon: Megaphone },
      { label: "Legal", path: "/admin/legal", icon: FileText },
    ],
  },
  {
    heading: "System",
    items: [
      { label: "Reports", path: "/admin/reports", icon: BarChart3 },
      { label: "Users", path: "/admin/users", icon: Users },
      { label: "Audit Log", path: "/admin/audit-log", icon: History },
      { label: "Settings", path: "/admin/settings", icon: Settings },
    ],
  },
];

export const AGENT_NAV: NavGroup[] = [
  {
    heading: "Overview",
    items: [{ label: "Dashboard", path: "/agent", icon: LayoutDashboard }],
  },
  {
    heading: "Orders",
    items: [
      { label: "New Order", path: "/agent/new-order", icon: ShoppingCart },
      { label: "Orders", path: "/agent/orders", icon: ClipboardList },
      { label: "Customers", path: "/agent/customers", icon: Users },
    ],
  },
  {
    heading: "Reference",
    items: [
      { label: "Products", path: "/agent/products", icon: Package },
      { label: "Inventory", path: "/agent/inventory", icon: Boxes },
      { label: "Reports", path: "/agent/reports", icon: BarChart3 },
    ],
  },
];

export function navForRole(role: "agent" | "admin"): NavGroup[] {
  return role === "admin" ? ADMIN_NAV : AGENT_NAV;
}
