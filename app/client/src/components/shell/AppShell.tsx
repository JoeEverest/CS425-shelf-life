import { LogOut } from "lucide-react";
import { Navigate, NavLink, Outlet, useLocation } from "react-router";
import { useLogout, useMe, useSetupStatus, useStore } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import { can, ROLE_LABELS } from "@/lib/access";
import { NAV_SECTIONS } from "@/lib/nav";

export default function AppShell() {
	const me = useMe();
	const setup = useSetupStatus();
	const store = useStore();
	const logout = useLogout();
	const location = useLocation();

	if (setup.data?.needed) {
		return <Navigate to="/setup" replace />;
	}

	if (me.isPending) {
		return (
			<div className="grid min-h-svh place-items-center text-sm text-muted-foreground">
				Opening the ledger…
			</div>
		);
	}

	if (me.isError) {
		return <Navigate to="/login" replace state={{ from: location.pathname }} />;
	}

	const roles = me.data.roles;
	const sections = NAV_SECTIONS.map((section) => ({
		...section,
		items: section.items.filter((item) => can(roles, item.permission)),
	})).filter((section) => section.items.length > 0);

	return (
		<SidebarProvider>
			<Sidebar collapsible="icon">
				<SidebarHeader className="px-4 pt-5 pb-2 group-data-[collapsible=icon]:px-2">
					<div className="flex items-baseline gap-2 overflow-hidden">
						<span className="font-display text-xl font-bold tracking-tight text-sidebar-primary">
							ShelfLife
						</span>
						<span className="truncate text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
							{store.data?.name}
						</span>
					</div>
				</SidebarHeader>
				<SidebarContent>
					{sections.map((section) => (
						<SidebarGroup key={section.label}>
							<SidebarGroupLabel>{section.label}</SidebarGroupLabel>
							<SidebarGroupContent>
								<SidebarMenu>
									{section.items.map((item) => (
										<SidebarMenuItem key={item.path}>
											<SidebarMenuButton
												asChild
												isActive={location.pathname.startsWith(item.path)}
												tooltip={item.label}
											>
												<NavLink to={item.path}>
													<item.icon aria-hidden />
													<span>{item.label}</span>
												</NavLink>
											</SidebarMenuButton>
										</SidebarMenuItem>
									))}
								</SidebarMenu>
							</SidebarGroupContent>
						</SidebarGroup>
					))}
				</SidebarContent>
				<SidebarFooter className="px-4 pb-4 group-data-[collapsible=icon]:px-2">
					<div className="flex items-center justify-between gap-2 overflow-hidden">
						<div className="min-w-0 group-data-[collapsible=icon]:hidden">
							<p className="truncate text-sm font-medium text-sidebar-foreground">
								{me.data.name}
							</p>
							<p className="truncate text-xs text-sidebar-foreground/70">
								{roles.map((role) => ROLE_LABELS[role]).join(" · ")}
							</p>
						</div>
						<Button
							variant="ghost"
							size="icon"
							className="shrink-0 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
							aria-label="Log out"
							onClick={() => {
								logout.mutate(undefined, {
									onSettled: () => {
										window.location.assign("/login");
									},
								});
							}}
						>
							<LogOut aria-hidden />
						</Button>
					</div>
				</SidebarFooter>
			</Sidebar>
			<SidebarInset>
				<div className="flex items-center gap-2 border-b px-4 py-2 md:hidden">
					<SidebarTrigger aria-label="Toggle navigation" />
					<span className="font-display font-semibold">ShelfLife</span>
				</div>
				<main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
					<Outlet />
				</main>
			</SidebarInset>
		</SidebarProvider>
	);
}
