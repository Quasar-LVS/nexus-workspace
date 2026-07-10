import { createDbAdminClient } from "../database/client";
import { DatabaseError } from "../errors/custom-errors";
import { logger } from "../utils/logger";

export interface ClerkUserWebhookPayload {
  id: string;
  email_addresses: Array<{ email_address: string }>;
  first_name?: string;
  last_name?: string;
  image_url?: string;
}

/**
 * Authentication Service (BLL)
 * Manages user profile synchronizations, Clerk event mapping, and session integrity.
 */
export class AuthService {
  /**
   * Synchronizes a user creation or update event from Clerk into the database
   */
  async syncClerkProfile(payload: ClerkUserWebhookPayload): Promise<void> {
    const userId = payload.id;
    const email = payload.email_addresses[0]?.email_address || "";
    const firstName = payload.first_name || null;
    const lastName = payload.last_name || null;
    const imageUrl = payload.image_url || null;

    const context = { userId, email, action: "syncClerkProfile" };
    logger.info(`Synchronizing Clerk profile updates into Supabase database`, context);

    const adminClient = createDbAdminClient();

    // Perform database upsert bypassing RLS (webhook session lacks user credentials)
    const { error } = await adminClient
      .from("profiles")
      .upsert({
        id: userId,
        email,
        first_name: firstName,
        last_name: lastName,
        avatar_url: imageUrl,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      logger.error("Failed to upsert user profile into PostgreSQL profiles table", error, context);
      throw new DatabaseError("Error syncing Clerk profile data.", error);
    }

    logger.info(`Profile upserted successfully for user: ${userId}`, context);
  }

  /**
   * Processes account deletions triggered by Clerk webhook alerts
   */
  async deleteClerkProfile(userId: string): Promise<void> {
    const context = { userId, action: "deleteClerkProfile" };
    logger.info(`Synchronizing Clerk profile deletion event`, context);

    const adminClient = createDbAdminClient();
    
    // Set status to inactive or delete. For now, delete record
    const { error } = await adminClient
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (error) {
      logger.error("Failed to delete user profile from PostgreSQL profiles table", error, context);
      throw new DatabaseError("Error deleting profile data.", error);
    }

    logger.info(`Profile deleted successfully for user: ${userId}`, context);
  }
}
export const authService = new AuthService();
