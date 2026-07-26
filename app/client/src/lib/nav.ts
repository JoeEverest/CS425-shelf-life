import {
	Boxes,
	ClipboardList,
	Contact,
	LayoutDashboard,
	PackageOpen,
	Receipt,
	Scale,
	ScanLine,
	Truck,
	Users,
} from "lucide-react";
import { can, PERMISSIONS, type Permission, type Role } from "@/lib/access";

export type NavItem = {
	label: string;
	path: string;
	permission: Permission;
	icon: typeof Boxes;
};

export const NAV_SECTIONS: Array<{ label: string; items: NavItem[] }> = [
	{
		label: "Overview",
		items: [
			{
				label: "Dashboard",
				path: "/dashboard",
				permission: PERMISSIONS.ANALYTICS_VIEW,
				icon: LayoutDashboard,
			},
		],
	},
	{
		label: "Counter",
		items: [
			{
				label: "Sell",
				path: "/sell",
				permission: PERMISSIONS.SALES_RECORD,
				icon: ScanLine,
			},
			{
				label: "Customers",
				path: "/customers",
				permission: PERMISSIONS.CUSTOMERS_MANAGE,
				icon: Contact,
			},
		],
	},
	{
		label: "Store",
		items: [
			{
				label: "Products",
				path: "/products",
				permission: PERMISSIONS.STOCK_VIEW,
				icon: PackageOpen,
			},
			{
				label: "Stock",
				path: "/stock",
				permission: PERMISSIONS.STOCK_VIEW,
				icon: Boxes,
			},
		],
	},
	{
		label: "Purchasing",
		items: [
			{
				label: "Suppliers",
				path: "/suppliers",
				permission: PERMISSIONS.SUPPLIERS_MANAGE,
				icon: Truck,
			},
			{
				label: "Purchase orders",
				path: "/purchase-orders",
				permission: PERMISSIONS.PURCHASE_ORDERS_VIEW,
				icon: ClipboardList,
			},
		],
	},
	{
		label: "Money",
		items: [
			{
				label: "Expenses",
				path: "/expenses",
				permission: PERMISSIONS.EXPENSES_MANAGE,
				icon: Receipt,
			},
			{
				label: "Reports",
				path: "/reports",
				permission: PERMISSIONS.REPORTS_VIEW,
				icon: Scale,
			},
		],
	},
	{
		label: "Administration",
		items: [
			{
				label: "Employees",
				path: "/employees",
				permission: PERMISSIONS.EMPLOYEES_MANAGE,
				icon: Users,
			},
		],
	},
];

export function firstPermittedPath(roles: readonly Role[]): string {
	for (const section of NAV_SECTIONS) {
		for (const item of section.items) {
			if (can(roles, item.permission)) {
				return item.path;
			}
		}
	}
	return "/products";
}
