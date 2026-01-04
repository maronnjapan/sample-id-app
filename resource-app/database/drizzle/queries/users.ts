import { eq } from "drizzle-orm";
import type { dbD1 } from "../db";
import { userTable } from "../schema/user";

export function findUserByAuth0Id(db: ReturnType<typeof dbD1>, auth0Id: string) {
  return db.select().from(userTable).where(eq(userTable.auth0Id, auth0Id)).get();
}

export function createUser(db: ReturnType<typeof dbD1>, auth0Id: string, email: string) {
  return db.insert(userTable).values({ auth0Id, email });
}

export function updateUserBlocked(db: ReturnType<typeof dbD1>, auth0Id: string, isBlocked: boolean) {
  return db.update(userTable).set({ isBlocked }).where(eq(userTable.auth0Id, auth0Id));
}
