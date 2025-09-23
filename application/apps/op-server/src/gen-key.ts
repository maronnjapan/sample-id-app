async function getKey() {

    const KEY_BASE_OPTIONS = {
        name: 'ECDSA',
        namedCurve: "P-256",
        hash: 'SHA-256'
    } as const
    const keyPair = await crypto.subtle.generateKey(
        {
            ...KEY_BASE_OPTIONS,
        },
        true,
        /**
         * 用途はJWTの署名・検証のためなので、signとverifyを指定
         * https://developer.mozilla.org/ja/docs/Web/API/SubtleCrypto/generateKey#keyusages
         */
        ['sign', 'verify']
    );

    console.log(JSON.stringify(await crypto.subtle.exportKey('jwk', keyPair.privateKey)));
}

getKey();