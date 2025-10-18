import { Config } from '@/config'
import { Redis } from '@upstash/redis';
import { createRemoteJWKSet, errors, jwtVerify } from 'jose'

const redis = Redis.fromEnv();

export async function GET(request: Request) {
    const headerValue = request.headers.get('Authorization') || request.headers.get('authorization')
    if (!headerValue?.startsWith('Bearer ')) {
        return Response.json({ message: 'ログインしていません' }, { status: 401 })
    }

    const accessToken = headerValue.slice('Bearer '.length).trim()
    if (!accessToken) {
        return Response.json({ message: '不正なトークンです' }, { status: 401 })
    }

    try {
        const domain = Config.auth0Domain
        const audience = Config.appApiAudience

        const { payload } = await jwtVerify(
            accessToken,
            createRemoteJWKSet(new URL(`https://${Config.auth0Domain}`, `/.well-known/jwks.json`)),
            {
                issuer: `https://${domain}/`,
                audience
            }
        )

        const userId = typeof payload.sub === 'string' ? payload.sub : undefined
        if (!userId) {
            return Response.json({ message: 'トークンの内容が不正です' }, { status: 401 })
        }

        const isBlocked = await redis.get(userId)
        if (Boolean(isBlocked) === true) {
            return Response.json({ message: 'ユーザーはブロックされています' }, { status: 403 })
        }

        return Response.json({ message: 'ログイン済みです', token: payload }, { status: 200 })
    } catch (error) {
        console.error('Token verification failed', error)

        if (error instanceof errors.JWTExpired) {
            return Response.json({ message: 'トークンの有効期限が切れています' }, { status: 401 })
        }

        return Response.json({ message: '不正なトークンです' }, { status: 401 })
    }
}
