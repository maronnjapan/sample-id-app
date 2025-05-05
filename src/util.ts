import { monotonicFactory } from 'ulid';
export const sortUlid = monotonicFactory();

export const stringToArrayBuffer = (str: string) => {
    const buffer = new ArrayBuffer(str.length);
    const bufferView = new Uint8Array(buffer);
    for (let i = 0; i < str.length; i++) {
        bufferView[i] = str.charCodeAt(i);
    }
    return buffer;
}

export const base64UrlDecode = (str: string) => {
    /**  URLで使用可能な形式にエンコードされた文字列を元のBase64で使用される文字列に置換 */
    const replaceStr = str.replace(/-/g, '+').replace(/_/g, '/');
    /**
     * Base64の文字数が4の倍数になるようにパディング文字列を追加
     * パディング文字列は'='である
     * パディングについての記事
     * https://qiita.com/yagaodekawasu/items/bd8a1db4529cfc921bba
     */
    const padding = Array(replaceStr.length * 8 % 6).map(() => '=').join('');
    return atob(`${replaceStr}${padding}`);
}

export const getPublicKey = (payload: string) => {
    return JSON.parse(base64UrlDecode(payload)).key as {
        "crv": "P-256",
        "kty": "EC",
        "x": string,
        "y": string
    }
}

export const verifySecSessionResponseToken = async (token: string) => {
    const [header, payload, signature] = token.split('.')

    const publicKey = getPublicKey(payload)
    const keyOption = {
        name: 'ECDSA',
        namedCurve: "P-256",
        hash: 'SHA-256'
    }
    const encoder = new TextEncoder()
    const publicKeyData = await crypto.subtle.importKey('jwk', publicKey, keyOption, true, ['verify']);
    /**
     * 署名を検証
     * 署名はURLのクエリで使用可能な形式にエンコードされているので元のバイナリに戻す
     * 署名に使用したheaderとpayloadを結合したものははURLのパスで使用可能な形式にエンコード後、
     * TextEncoderのencodeでArrayBufferViewに変換されたものとなっている。
     * なので、検証に使うときは単純にTextEncoderのencodeでArrayBufferViewに変換したものを使う
     */
    return await crypto.subtle.verify(keyOption, publicKeyData, stringToArrayBuffer(base64UrlDecode(signature)), encoder.encode(`${header}.${payload}`))
} 