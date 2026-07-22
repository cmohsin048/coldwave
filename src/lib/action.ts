import { z } from "zod";
import {
  requireOrgContext,
  requireRole,
  type OrgContext,
  ForbiddenError,
  UnauthenticatedError,
} from "@/lib/tenant";
import { logger } from "@/lib/logger";

/**
 * Typed Server Action wrapper. Every mutation:
 *   1. authenticates + resolves the org context (multi-tenant isolation),
 *   2. validates input with a Zod schema,
 *   3. returns a discriminated result so client code never throws on
 *      validation/permission errors.
 *
 * Usage:
 *   export const createList = action(createListSchema, async (input, ctx) => {
 *     // input is typed & validated; ctx.orgId is safe to scope queries with
 *   });
 */

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

interface ActionOptions {
  /** Minimum org role required to run this action. */
  role?: "owner" | "admin" | "member";
}

export function action<S extends z.ZodTypeAny, TOutput>(
  schema: S,
  handler: (input: z.output<S>, ctx: OrgContext) => Promise<TOutput>,
  options: ActionOptions = {}
) {
  return async (raw: unknown): Promise<ActionResult<TOutput>> => {
    try {
      const ctx = options.role
        ? await requireRole(options.role)
        : await requireOrgContext();

      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: "Validation failed",
          fieldErrors: parsed.error.flatten().fieldErrors as Record<
            string,
            string[]
          >,
        };
      }

      const data = await handler(parsed.data, ctx);
      return { ok: true, data };
    } catch (err) {
      // Next.js implements redirect()/notFound() by throwing control-flow
      // errors that its runtime must receive — rethrow them untouched.
      if (
        typeof err === "object" &&
        err !== null &&
        "digest" in err &&
        typeof (err as { digest: unknown }).digest === "string" &&
        ((err as { digest: string }).digest.startsWith("NEXT_REDIRECT") ||
          (err as { digest: string }).digest.startsWith("NEXT_HTTP_ERROR"))
      ) {
        throw err;
      }
      if (
        err instanceof UnauthenticatedError ||
        err instanceof ForbiddenError
      ) {
        return { ok: false, error: err.message };
      }
      logger.error("action failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        ok: false,
        error:
          process.env.NODE_ENV === "production"
            ? "Something went wrong"
            : err instanceof Error
              ? err.message
              : String(err),
      };
    }
  };
}
