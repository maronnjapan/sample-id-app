import { ExternalSigningKey, JWK } from "oidc-provider";

export const getPrivateKeys = async (): Promise<Array<JWK | ExternalSigningKey>> => {
    const KEY_BASE_OPTIONS = {
        name: 'ECDSA',
        namedCurve: "P-256",
        hash: 'SHA-256'
    } as const

    const privateKey = JSON.parse(process.env.PRIVATE_KEY!);


    const privateJwk = await crypto.subtle.importKey('jwk', privateKey, KEY_BASE_OPTIONS, true, ['sign']);
    const privateJwkJson = await crypto.subtle.exportKey('jwk', privateJwk);
    return [privateJwkJson];
}