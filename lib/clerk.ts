import { auth, currentUser } from "@clerk/nextjs/server";

export interface NexusUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  imageUrl?: string;
}

/**
 * Retrieves the current session authorization details.
 * Safely wraps Clerk's auth() for server components/actions.
 */
export async function getSessionAuth() {
  return auth();
}

/**
 * Retrieves the fully populated user details from Clerk session.
 */
export async function getSessionUser(): Promise<NexusUser | null> {
  const user = await currentUser();
  if (!user) return null;

  return {
    id: user.id,
    email: user.emailAddresses[0]?.emailAddress || "",
    firstName: user.firstName || undefined,
    lastName: user.lastName || undefined,
    imageUrl: user.imageUrl || undefined,
  };
}

/**
 * Verifies if user has specific organization privileges.
 */
export async function checkUserPermission(permission: string): Promise<boolean> {
  const { has } = await auth();
  return !!has({ permission });
}
