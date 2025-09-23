import Koa from 'koa'
import { route } from './router';
import Provider, { KoaContextWithOIDC } from 'oidc-provider';
import mount from 'koa-mount';
import { Server } from 'http';
import { getConfiguration } from './support/configuration';
import { Config } from './config';
const app = new Koa()

const { PORT = 3001, ISSUER = `http://localhost:${PORT}` } = process.env;

let server: Server | undefined = undefined;
getConfiguration().then((configuration) => {
    const provider = new Provider(ISSUER, configuration);

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
