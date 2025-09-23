import Router from '@koa/router'
import Provider, { InteractionResults } from 'oidc-provider'
import { match } from 'ts-pattern'
import { koaBody as bodyParser } from 'koa-body';
import { Config } from './config';
import { getUser } from './db/repository';
const router = new Router()

export const route = (provider: Provider) => {
    router.use(async (ctx, next) => {
        ctx.set('cache-control', 'no-store');
        await next();
    });

    router.get('/interaction/:uid', async (ctx, next) => {
        const {
            uid, prompt, params, session,
        } = await provider.interactionDetails(ctx.req, ctx.res);
        const client = await provider.Client.find(params.client_id as string);

        match(prompt.name)
            .with('login', () => {
                const loginPostInfo = {
                    path: `${Config.serverUrl}/interaction/${uid}/login`,
                    method: 'POST',
                    scope: []
                }
                ctx.redirect(`${Config.frontendUrl}/interaction/${uid}/login#${btoa(JSON.stringify(loginPostInfo))}`)
            })
            .with('consent', () => {
                const consentPostInfo = {
                    path: `${Config.serverUrl}/interaction/${uid}/confirm`,
                    method: 'POST',
                    scope: []
                }
                ctx.redirect(`${Config.frontendUrl}/interaction/${uid}/consent#${btoa(JSON.stringify(consentPostInfo))}`)
            })
            .otherwise(() => next());
    });


    const body = bodyParser({
        text: false, json: false, patchNode: true, patchKoa: true,
    });

    router.post('/interaction/:uid/login', body, async (ctx) => {
        const { prompt: { name } } = await provider.interactionDetails(ctx.req, ctx.res);

        if (name !== 'login') {
            return ctx.throw(400, 'Not a login interaction');
        }

        const requestBody = ctx.request.body as { email?: string; password?: string } | undefined;
        if (!requestBody || !requestBody.email || !requestBody.password) {
            return ctx.throw(400, 'Not Exist Search Parameter');
        };

        const account = await getUser({
            email: requestBody.email,
            password: requestBody.password,
        })

        if (!account) {
            return ctx.throw(404, 'Not Found User');
        }

        const result: InteractionResults = {
            login: {
                accountId: account.accountId,
            },
        };

        return provider.interactionFinished(ctx.req, ctx.res, result, {
            mergeWithLastSubmission: false,
        });
    });

    router.post('/interaction/:uid/confirm', body, async (ctx) => {
        const interactionDetails = await provider.interactionDetails(ctx.req, ctx.res);
        const { prompt: { name, details }, params, session } = interactionDetails;
        if (!session) {
            return ctx.throw(400, 'No session found');
        }

        let { grantId } = interactionDetails;
        let grant;

        if (grantId) {
            // we'll be modifying existing grant in existing session
            grant = await provider.Grant.find(grantId);
        } else {
            // we're establishing a new grant
            grant = new provider.Grant({
                accountId: session.accountId,
                clientId: params.client_id as string,
            });
        }

        if (details.missingOIDCScope) {
            grant?.addOIDCScope((details.missingOIDCScope as string[]).join(' '));
        }
        if (details.missingOIDCClaims) {
            grant?.addOIDCClaims(details.missingOIDCClaims as string[]);
        }
        if (details.missingResourceScopes) {
            for (const [indicator, scope] of Object.entries(details.missingResourceScopes)) {
                grant?.addResourceScope(indicator, scope.join(' '));
            }
        }

        grantId = await grant?.save();

        const consent: { grantId?: string } = {};
        if (!interactionDetails.grantId) {
            // we don't have to pass grantId to consent, we're just modifying existing one
            consent.grantId = grantId;
        }

        const result = { consent };
        return await provider.interactionFinished(ctx.req, ctx.res, result, {
            mergeWithLastSubmission: true,
        });
    });
    return router;
}