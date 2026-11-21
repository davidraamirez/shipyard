"use client";

import { Suspense, useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearToken, getToken } from "@/lib/auth";

// sessionStorage is per tab: nothing else can change the token,
// so there is nothing to subscribe to. Signing out navigates to
// /login, which reads the value again.
function subscribeToStorage() {
  return () => {};
}

function NavLinks({ active }: { active: boolean }) {
  return (
    <nav className="mt-10">
      <Link
        href="/"
        className={`block rounded-lg px-4 py-3 text-sm font-medium ${
          active ? "bg-slate-800" : "text-slate-400 hover:bg-slate-900"
        }`}
      >
        Projects
      </Link>
    </nav>
  );
}

// Reads the URL (usePathname), so it sits inside <Suspense>: with Cache
// Components, URL data cannot be part of the static shell.
function SidebarNav() {
  const pathname = usePathname();

  return <NavLinks active={pathname === "/" || pathname.startsWith("/projects")} />;
}

// Layout for pages that require a session. Without a token it redirects
// to /login before showing the page.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // In the browser the token is read from sessionStorage. On the server it
  // does not exist, and the page renders as if signed in: pages only
  // load data in useEffect, so the server sees no data and Next
  // can validate the static shell of every route (Cache Components). Without a
  // token, the browser switches to "Loading..." and redirects to /login.
  const authenticated = useSyncExternalStore(
    subscribeToStorage,
    () => getToken() !== null,
    () => true,
  );

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
    }
  }, [router, authenticated]);

  function handleSignOut() {
    clearToken();
    router.replace("/login");
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-500">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="hidden w-64 shrink-0 border-r border-slate-800 p-6 md:block">
        <Link href="/" className="text-2xl font-bold tracking-tight">
          Shipyard<span className="text-cyan-400">.</span>
        </Link>
        <p className="mt-2 text-sm text-slate-500">Deployment platform</p>

        <Suspense fallback={<NavLinks active={false} />}>
          <SidebarNav />
        </Suspense>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4 md:px-10">
          <Link href="/" className="text-lg font-bold md:hidden">
            Shipyard<span className="text-cyan-400">.</span>
          </Link>
          <span className="hidden md:block" />
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-900"
          >
            Sign out
          </button>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 p-6 md:p-10">
          {/* The [id] pages read useParams(): they need their own boundary. */}
          <Suspense fallback={<p className="text-sm text-slate-500">Loading...</p>}>
            {children}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
