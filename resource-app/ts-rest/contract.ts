import { initContract } from "@ts-rest/core";

const c = initContract();

export type UserResponse = {
  id: number;
  auth0Id: string;
  email: string;
  isBlocked: boolean;
};

/**
 * ts-rest contract
 *
 * Create a contract, this should ideally be shared between your consumers and producers
 * Think of this as your HTTP Schema that both your client and backend can use.
 * @link {@see https://ts-rest.com/docs/core/}
 **/
export const contract = c.router(
  {
    getUser: {
      method: "GET",
      path: "/user",
      responses: {
        200: c.type<{ user: UserResponse }>(),
        401: c.type<{ error: string }>(),
        403: c.type<{ error: string; user: UserResponse }>(),
        404: c.type<{ error: string }>(),
      },
      summary: "Get current user info",
    },
    createTodo: {
      method: "POST",
      path: "/todo/create",
      body: c.type<{ text: string }>(),
      responses: {
        200: c.type<{ status: string }>(),
      },
      summary: "Create a Todo",
    },
    updateUserBlocked: {
      method: "POST",
      path: "/user/blocked",
      body: c.type<{ user_id: string; blocked: boolean }>(),
      responses: {
        200: c.type<{ status: string }>(),
        404: c.type<{ error: string }>(),
      },
      summary: "Update user blocked status",
    },
  },
  {
    pathPrefix: "/api",
  },
);
