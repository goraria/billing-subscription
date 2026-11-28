import type { Binding, Event, AuthContext, ServiceAccess } from "@/utils/interface";
import { createHonoRequestGuard } from "@/modules/principle/request-guard";
import type { MiddlewareHandler } from "hono"

import {
  serviceAuthFailure,
  verifyServiceRequest,
} from "@/lib/auth/verification"
import { rawGetServiceUser } from "@/models/users"

export function requireAuth(access: ServiceAccess): MiddlewareHandler<Binding> {
  return createHonoRequestGuard<AuthContext>({
    async verify(request) {
      const verified = await verifyServiceRequest(request, access)
      const user = await rawGetServiceUser(
        verified.subject,
        request.headers.get("authorization")!.slice(7)
      )
      return {
        application: verified.application,
        clientId: verified.clientId,
        scopes: verified.scopes,
        sessionId: verified.sessionId,
        user,
      }
    },
    failure: serviceAuthFailure,
    assign(event, auth) {
      event.set("auth", auth)
    },
  })
}

export function requireAdmin(): MiddlewareHandler<Binding> {
  return async (context: Event, next) => {
    const role = context.get("auth")!.user.role
    if (role !== "admin" && role !== "master")
      return Response.json(
        { error: "admin_required" },
        {
          status: 403,
          headers: { "content-type": "application/json; charset=UTF-8" },
        }
      )
    return await next()
  }
}
