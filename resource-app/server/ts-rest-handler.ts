import type { Session } from "@auth/core/types";
import type { dbD1 } from "../database/drizzle/db";
import * as drizzleQueries from "../database/drizzle/queries/todos";
import * as userQueries from "../database/drizzle/queries/users";
import { fetchRequestHandler, tsr } from "@ts-rest/serverless/fetch";
import { enhance, type UniversalHandler } from "@universal-middleware/core";
import { contract } from "../ts-rest/contract";

type PlatformContext = {
  db: ReturnType<typeof dbD1>;
  session?: Session | null;
};

/**
 * ts-rest route
 *
 * @link {@see https://ts-rest.com/docs/serverless/fetch-runtimes/}
 **/
const router = tsr.platformContext<PlatformContext>().router(contract, {
  getUser: async (_args, ctx) => {
    const userId = ctx.session?.user?.id;
    if (!userId) {
      return {
        status: 401,
        body: { error: "Unauthorized" },
      };
    }

    const user = await userQueries.findUserByAuth0Id(ctx.db, userId);
    if (!user) {
      return {
        status: 404,
        body: { error: "User not found" },
      };
    }

    const userResponse = {
      id: user.id,
      auth0Id: user.auth0Id,
      email: user.email,
      isBlocked: user.isBlocked,
    };

    if (user.isBlocked) {
      return {
        status: 403,
        body: {
          error: "User is blocked",
          user: userResponse,
        },
      };
    }

    return {
      status: 200,
      body: { user: userResponse },
    };
  },
  createTodo: async ({ body }, _ctx) => {
    await drizzleQueries.insertTodo(_ctx.db, body.text);

    return {
      status: 200,
      body: {
        status: "Ok",
      },
    };
  },
  updateUserBlocked: async ({ body }, _ctx) => {
    const existingUser = await userQueries.findUserByAuth0Id(_ctx.db, body.user_id);
    if (!existingUser) {
      return {
        status: 404,
        body: {
          error: "User not found",
        },
      };
    }

    await userQueries.updateUserBlocked(_ctx.db, body.user_id, body.blocked);

    return {
      status: 200,
      body: {
        status: "Ok",
      },
    };
  },
});

export const tsRestHandler: UniversalHandler = enhance(
  async (request, ctx, runtime) =>
    fetchRequestHandler({
      request: new Request(request.url, request),
      contract,
      router,
      options: {},
      platformContext: {
        ...ctx,
        ...runtime,
      } as any,
    }),
  {
    name: "my-app:ts-rest-handler",
    path: `/api/**`,
    method: ["GET", "POST"],
    immutable: false,
  },
);
