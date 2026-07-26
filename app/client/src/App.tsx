import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { useMe } from "@/api/hooks";
import AppShell from "@/components/shell/AppShell";
import { firstPermittedPath } from "@/lib/nav";
import CustomersPage from "@/pages/CustomersPage";
import DashboardPage from "@/pages/DashboardPage";
import EmployeesPage from "@/pages/EmployeesPage";
import ExpensesPage from "@/pages/ExpensesPage";
import LoginPage from "@/pages/LoginPage";
import ProductsPage from "@/pages/ProductsPage";
import PurchaseOrdersPage from "@/pages/PurchaseOrdersPage";
import ReportsPage from "@/pages/ReportsPage";
import SellPage from "@/pages/SellPage";
import SetupPage from "@/pages/SetupPage";
import StockPage from "@/pages/StockPage";
import SuppliersPage from "@/pages/SuppliersPage";

function IndexRedirect() {
	const me = useMe();
	if (!me.data) {
		return null;
	}
	return <Navigate to={firstPermittedPath(me.data.roles)} replace />;
}

function App() {
	return (
		<BrowserRouter>
			<Routes>
				<Route path="/login" element={<LoginPage />} />
				<Route path="/setup" element={<SetupPage />} />
				<Route element={<AppShell />}>
					<Route index element={<IndexRedirect />} />
					<Route path="/dashboard" element={<DashboardPage />} />
					<Route path="/sell" element={<SellPage />} />
					<Route path="/customers" element={<CustomersPage />} />
					<Route path="/products" element={<ProductsPage />} />
					<Route path="/stock" element={<StockPage />} />
					<Route path="/suppliers" element={<SuppliersPage />} />
					<Route path="/purchase-orders" element={<PurchaseOrdersPage />} />
					<Route path="/expenses" element={<ExpensesPage />} />
					<Route path="/reports" element={<ReportsPage />} />
					<Route path="/employees" element={<EmployeesPage />} />
					<Route path="*" element={<Navigate to="/" replace />} />
				</Route>
			</Routes>
		</BrowserRouter>
	);
}

export default App;
