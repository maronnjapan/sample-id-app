import { Config } from '@/config'
import { Redis } from '@upstash/redis';
import { createRemoteJWKSet, jwtVerify } from 'jose'

const redis = Redis.fromEnv();

type BlockNotification = {
  token: string
}

export async function POST(request: Request) {
  let body: BlockNotification
  try {
    body = await request.json() as BlockNotification
  } catch (error) {
    console.error('Failed to parse block notification payload', error)
    return Response.json({ message: '無効なリクエストです' }, { status: 400 })
  }

  if (!body?.token) {
    return Response.json({ message: 'トークンが見つかりません' }, { status: 400 })
  }

  const { payload } = await jwtVerify(body.token, createRemoteJWKSet(new URL('/.well-known/jwks.json', Config.userBlockAppUrl)))

  const userId = typeof payload.user_id === 'string' ? payload.user_id : undefined
  const isBlocked = payload.blocked === true
  const expiresAtSeconds = typeof payload.exp === 'number' ? payload.exp : undefined

  if (!userId || !expiresAtSeconds) {
    return Response.json({ message: 'トークンの内容が不正です' }, { status: 400 })
  }

  if (isBlocked) {
    await redis.set(userId, true)
    return Response.json({ message: 'ユーザーをブロックしました' }, { status: 200 })
  }

  await redis.set(userId, false)
  return Response.json({ message: 'ユーザーのブロックを解除しました' }, { status: 200 })
}
