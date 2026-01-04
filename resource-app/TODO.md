Follow the steps below to finish setting up your application.

## Auth0

- Sign up or login to an Auth0 account, then go to [your Dashboard](https://manage.auth0.com/dashboard/)
- Create Application -> Regular Web Application
- What technology are you using for your project? -> Node.js (Express) -> Integrate Now
- Configure Auth0:
  - Allowed Callback URL: http://localhost:3000/api/auth/callback/auth0
  - Allowed Logout URLs: http://localhost:3000
- Save Changes
- Copy your `Client ID`, `Client Secret` and `Domain` and paste it in `.env` file like this:

```env
// .env
AUTH0_CLIENT_SECRET=<Client Secret>
AUTH0_CLIENT_ID=<Client ID>
AUTH0_ISSUER_BASE_URL=https://<your-auth0-domain>.<eu>.auth0.com
```

> \[!NOTE]
> Login route is `http://localhost:3000/api/auth/signin`.
> Logout route is `http://localhost:3000/api/auth/signout`.

- Read more [Auth.js: Auth0 provider](https://authjs.dev/reference/core/providers/auth0)

## Cloudflare D1

Create the `my-vike-demo-database` database:

```sh
pnpm wrangler d1 create my-vike-demo-database
```

Then migrate:

```sh
pnpm drizzle:migrate
```

More infos can be found at https://developers.cloudflare.com/d1/get-started/

## Drizzle

First, ensure that `DATABASE_URL` is configured in `.env` file, then create the database:

```bash
pnpm drizzle:generate # a script that executes drizzle-kit generate.
pnpm drizzle:migrate # a script that executes drizzle-kit migrate.
```

> \[!NOTE]
> The `drizzle-kit generate` command is used to generate SQL migration files based on your Drizzle schema.
>
> The `drizzle-kit migrate` command is used to apply the generated migrations to your database.

Read more on [Drizzle ORM documentation](https://orm.drizzle.team/docs/overview)

## Cloudflare Workers

Run [`wrangler types`](https://developers.cloudflare.com/workers/wrangler/commands/#types) to generate the `worker-configuration.d.ts` file:

```sh
pnpm dlx wrangler types
```

> Re-run it whenever you change your Cloudflare configuration to update `worker-configuration.d.ts`.

Then commit `worker-configuration.d.ts`:

```sh
git commit -am "add cloudflare types"
```

See also: https://vike.dev/cloudflare#typescript

