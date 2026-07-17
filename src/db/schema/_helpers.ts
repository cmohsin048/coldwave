import { timestamp, text } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";

/** Collision-resistant string primary key. */
export function primaryId(prefix?: string) {
  return text("id")
    .primaryKey()
    .$defaultFn(() => (prefix ? `${prefix}_${nanoid(21)}` : nanoid(21)));
}

/** Standard created/updated timestamps applied to every table. */
export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
