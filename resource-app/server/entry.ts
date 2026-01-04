import { authjsHandler, authjsSessionMiddleware } from "./authjs-handler";
import { dbMiddleware } from "./db-middleware";
import { tsRestHandler } from "./ts-rest-handler";
import { apply, serve } from "@photonjs/hono";
import { Hono } from "hono";

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

export default startApp() as unknown;

function startApp() {
  const app = new Hono();

  apply(app, [
    // Make database available in Context as `context.db`
    dbMiddleware,

    // Append Auth.js session to context
    authjsSessionMiddleware,

    // Auth.js route. See https://authjs.dev/getting-started/installation
    authjsHandler,

    // ts-rest route. See https://ts-rest.com
    tsRestHandler,
  ]);

  return serve(app, {
    port,
  });
}
