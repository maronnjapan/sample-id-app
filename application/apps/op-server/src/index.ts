import Koa from 'koa'
import { route } from './router';
import Provider, { KoaContextWithOIDC } from 'oidc-provider';
import mount from 'koa-mount';
import { Server } from 'http';
import { getConfiguration } from './support/configuration';
import { Config } from './config';
const app = new Koa()

const { PORT = 3001, ISSUER = `http://localhost:${PORT}` } = process.env;

async function tokenExchangeHandler(ctx: KoaContextWithOIDC) {
    // console.log(ctx.oidc);
    // console.log('リクエストボディ', ctx.oidc.params);
    // console.log('リクエストボディ2', ctx.oidc.body);
    // console.log('ヘッダー', ctx.oidc.ctx.request.header);
    // console.log('Authorizationヘッダー', ctx.oidc.ctx.request.header.authorization);
    ctx.body = { success: true, message: 'token exchange success' };
}

let server: Server | undefined = undefined;
getConfiguration().then((configuration) => {
    const provider = new Provider(ISSUER, configuration);
    const parameters = [
        'audience',
        'resource',
        'scope',
        'requested_token_type',
        'subject_token',
        'subject_token_type',
        'actor_token',
        'actor_token_type',
    ];
    const allowedDuplicateParameters = ['audience', 'resource'];
    const grantType = 'urn:ietf:params:oauth:grant-type:token-exchange';
    provider.registerGrantType(
        grantType,
        tokenExchangeHandler,
        parameters,
        allowedDuplicateParameters,
    );

    app.use(route(provider).routes());
    app.use(mount(provider));
    server = app.listen(PORT, () => {
        console.log(`application is listening on port ${PORT}, check its /.well-known/openid-configuration`);
        const address = server?.address()
        if (address && typeof address !== 'string') {
            const LOCALHOST = 'localhost';
            const host = address.address === '::' ? LOCALHOST : address.address;
            const port = address.port;
            const protocol = host === LOCALHOST ? 'http' : 'https';
            const url = `${protocol}://${host}:${port}`;
            Config.setServerUrl(url);
        }

        if (!Config.serverUrl) {
            throw new Error('サーバーURLが設定されていません');
        }
    });
}).catch((err) => {
    console.log('設定の取得に失敗しました', err);
    console.log(server)
    if (server?.listening) {
        server.close();
    }
    console.error(err);
    process.exitCode = 1;
})
