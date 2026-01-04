import { env as cloudflareEnv } from "cloudflare:workers";
import { Auth, type AuthConfig, createActionURL, setEnvDefaults } from "@auth/core";
import Auth0 from "@auth/core/providers/auth0";
import CredentialsProvider from "@auth/core/providers/credentials";
import type { Session } from "@auth/core/types";
import { enhance, type UniversalHandler, type UniversalMiddleware } from "@universal-middleware/core";
import { createUser, findUserByAuth0Id } from "../database/drizzle/queries/users";

// セッションにユーザーIDを含めるための型拡張
declare module "@auth/core/types" {
  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

const env = cloudflareEnv;

const authjsConfig = {
  basePath: "/api/auth",
  trustHost: true,
  // TODO: Replace secret {@see https://authjs.dev/reference/core#secret}
  secret: env.AUTH_SECRET,
  providers: [
    // TODO: Choose and implement providers
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text", placeholder: "jsmith" },
        password: { label: "Password", type: "password" },
      },
      async authorize() {
        // Add logic here to look up the user from the credentials supplied
        const user = { id: "1", name: "J Smith", email: "jsmith@example.com" };

        // Any object returned will be saved in `user` property of the JWT
        // If you return null then an error will be displayed advising the user to check their details.
        // You can also Reject this callback with an Error thus the user will be sent to the error page with the error message as a query parameter
        return user ?? null;
      },
    }),

    Auth0({
      issuer: env.AUTH0_ISSUER_BASE_URL,
      clientId: env.AUTH0_CLIENT_ID,
      clientSecret: env.AUTH0_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    jwt({ token, account, profile }) {
      // Auth0のsubをトークンに保存
      if (account && profile) {
        token.sub = profile.sub ?? undefined;
      }
      return token;
    },
    session({ session, token }) {
      // トークンからセッションにユーザーIDを渡す
      if (token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
} satisfies Omit<AuthConfig, "raw">;

/**
 * Retrieve Auth.js session from Request
 */
export async function getSession(req: Request, config: Omit<AuthConfig, "raw">): Promise<Session | null> {
  setEnvDefaults(process.env, config);
  const requestURL = new URL(req.url);
  const url = createActionURL("session", requestURL.protocol, req.headers, process.env, config);

  const response = await Auth(new Request(url, { headers: { cookie: req.headers.get("cookie") ?? "" } }), config);

  const { status = 200 } = response;

  const data = await response.json();

  if (!data || !Object.keys(data).length) return null;
  if (status === 200) return data as Session;
  throw new Error(typeof data === "object" && "message" in data ? (data.message as string) : undefined);
}

// Note: You can also directly use your server, instead of defining a universal middleware. (Vike's scaffolder uses https://github.com/magne4000/universal-middleware to simplify its internal logic.)
/**
 * Add Auth.js session to the context.
 * @link {@see https://authjs.dev/getting-started/session-management/get-session}
 */
export const authjsSessionMiddleware: UniversalMiddleware = enhance(
  // The context we add here is automatically merged into pageContext
  async (request, context) => {
    try {
      const session = await getSession(request, authjsConfig);

      // ログインユーザーがDBに存在しなければ登録
      if (session?.user?.id && session?.user?.email && context.db) {
        const existingUser = await findUserByAuth0Id(context.db, session.user.id);
        if (!existingUser) {
          await createUser(context.db, session.user.id, session.user.email);
        }
      }

      return {
        ...context,
        // Sets pageContext.session
        session,
      };
    } catch (error) {
      console.debug("authjsSessionMiddleware:", error);
      return {
        ...context,
        session: null,
      };
    }
  },
  {
    name: "my-app:authjs-middleware",
    immutable: false,
  },
);

/**
 * Auth.js route
 * @link {@see https://authjs.dev/getting-started/installation}
 **/
export const authjsHandler = enhance(
  async (request) => {
    return Auth(request, authjsConfig);
  },
  {
    name: "my-app:authjs-handler",
    path: "/api/auth/**",
    method: ["GET", "POST"],
    immutable: false,
  },
) satisfies UniversalHandler;
