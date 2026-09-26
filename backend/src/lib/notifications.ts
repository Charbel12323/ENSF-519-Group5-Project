import { Db } from "./access";

export async function notify(db: Db, recipientId: string | null | undefined, actorId: string, groupId: string, kind: string, message: string, taskId?: string) {
  if (!recipientId || recipientId === actorId) return;
  await db.notification.create({ data: { recipientId, groupId, kind, message, taskId } });
}

// Mentions use a member's email to disambiguate people with the same name.
export function mentionedEmails(body: string) {
  return new Set(Array.from(body.matchAll(/@([a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi), (m) => m[1].toLowerCase()));
}
