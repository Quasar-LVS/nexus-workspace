import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Define the public routes list
const isPublicRoute = createRouteMatcher(["/", "/api/webhooks/clerk", "/api/health"]);

export default clerkMiddleware(async (auth, req) => {
  // Enforce auth protection for any route that is not public
  if (!isPublicRoute(req)) {
    await auth.protect();
  }

  // Clone and append pathname headers for down-stream layouts
  const { pathname } = req.nextUrl;
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-url", req.url);
  requestHeaders.set("x-pathname", pathname);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
});

export const config = {
  matcher: [
    // Match all request paths except static assets
    '/((?!_next|[^?]*\\.(?:html|css|js|jpeg|jpg|png|gif|svg|ttf|woff2?|ico|csv|docx|xlsx|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
