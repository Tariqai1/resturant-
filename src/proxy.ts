import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSuperAdminEmails } from "@/lib/auth/super-admin";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isLoginPage = request.nextUrl.pathname === "/login";
  const isSuperAdminLoginPage = request.nextUrl.pathname === "/super-admin/login";
  const isSetupPage = request.nextUrl.pathname === "/setup";
  const isEnterPage = request.nextUrl.pathname === "/enter";
  const isCustomerTableRoute = request.nextUrl.pathname.startsWith("/table/");
  const isPublicApi =
    request.nextUrl.pathname === "/api/health" ||
    request.nextUrl.pathname === "/api/setup" ||
    request.nextUrl.pathname.startsWith("/api/public/") ||
    request.nextUrl.pathname.startsWith("/api/auth/");
  const isApiRoute = request.nextUrl.pathname.startsWith("/api/");

  const isSuperAdminRoute = request.nextUrl.pathname.startsWith("/super-admin");
  const isSuperAdminDashboard = isSuperAdminRoute && !isSuperAdminLoginPage;

  const superAdminEmails = getSuperAdminEmails();

  if (!user) {
    if (isPublicApi || isLoginPage || isSuperAdminLoginPage || isSetupPage || isEnterPage || isCustomerTableRoute) {
      return response;
    }

    if (isApiRoute) {
      return NextResponse.json(
        { ok: false, authenticated: false, message: "Staff authentication required" },
        { status: 401 },
      );
    }

    // Direct unauthenticated super-admin visitors to dedicated super-admin login
    if (isSuperAdminRoute) {
      return NextResponse.redirect(new URL("/super-admin/login", request.url));
    }

    return NextResponse.redirect(new URL("/login", request.url));
  }

  // If already authenticated as Super Admin and visiting super admin login, redirect to deck
  if (user && isSuperAdminLoginPage) {
    const email = user.email?.trim().toLowerCase();
    if (email && superAdminEmails.includes(email)) {
      return NextResponse.redirect(new URL("/super-admin", request.url));
    }
  }

  // Prevent non-super-admins from accessing the Super Admin command deck directly
  if (user && isSuperAdminDashboard) {
    const email = user.email?.trim().toLowerCase();
    if (!email || !superAdminEmails.includes(email)) {
      return NextResponse.redirect(new URL("/super-admin/login", request.url));
    }
  }

  // Parse active staff role
  const activeStaffCookie = request.cookies.get("od_active_staff")?.value;
  let activeRole = "";
  if (activeStaffCookie) {
    try {
      const parsed = JSON.parse(activeStaffCookie);
      activeRole = (parsed.role || "").toLowerCase();
    } catch {
      // ignore
    }
  }

  // 1. Kitchen Role Strict Isolation: Kitchen staff can ONLY access /kitchen
  if (activeRole === "kitchen") {
    const isKitchenPage = request.nextUrl.pathname === "/kitchen";
    if (!isKitchenPage && !isApiRoute && !isLoginPage) {
      return NextResponse.redirect(new URL("/kitchen", request.url));
    }
  }

  // 2. Staff Management Role Guard: Only Owner and Manager can access /staff
  if (request.nextUrl.pathname.startsWith("/staff")) {
    const email = user.email?.trim().toLowerCase();
    const isSuper = email && superAdminEmails.includes(email);
    if (!isSuper && activeRole && activeRole !== "owner" && activeRole !== "manager" && activeRole !== "admin") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|css|js)$).*)",
  ],
};