// Result型の定義
type Result<T, E> =
    | { ok: true; value: T; error?: never }
    | { ok: false; value?: never; error: E }

class InvalidValueError extends Error { }
class InvalidPropertyError extends Error { }

export const generateIdToken = async (params: {
    urlIssuedToken: string,
    userId: string,
    audience: string[],
    expirationSeconds?: number,
    authTime?: Date
}): Promise<Result<string, InvalidValueError | InvalidPropertyError>> => {

    /**
     * TODO: 以下の仕様を取り入れること
     * issが設定されている。
     * issの値がURLとして適切。
     * issのURLにクエリやフラグメントが付与されていない
     * subが設定されている
     * subがASCIIで255文字を超えていない
     * exp,iat,auth_timeが全て秒数になっているか
     * audはこの関数内ではないが、必ずRPのclientIdを含むこと
     */


    return {
        ok: true,
        value: 'id_token'
    }
}