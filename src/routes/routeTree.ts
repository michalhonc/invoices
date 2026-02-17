import { createRootRouteWithContext, createRoute } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { RootLayout } from "../components/RootLayout";
import { DashboardPage } from "./DashboardPage";
import { MonthsPage } from "./MonthsPage";
import { MonthDetailPage } from "./MonthDetailPage";
import { InvoiceDetailPage } from "./InvoiceDetailPage";
import { KhPage } from "./KhPage";
import { SettingsPage } from "./SettingsPage";
import { OverviewPage } from "./OverviewPage";

interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardPage,
});

const monthsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/months",
  component: MonthsPage,
});

const monthDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/months/$month",
  component: MonthDetailPage,
});

const invoiceDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/months/$month/invoices/$id",
  component: InvoiceDetailPage,
});

const khRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/months/$month/kh",
  component: KhPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/overview",
  component: OverviewPage,
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  monthsRoute,
  monthDetailRoute,
  invoiceDetailRoute,
  khRoute,
  overviewRoute,
  settingsRoute,
]);
