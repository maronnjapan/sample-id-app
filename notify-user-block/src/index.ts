import { Hono } from 'hono'
import { getSigningMaterial, signJwt } from './crypto'

export type Bindings = {
  JWT_PRIVATE_KEY: string
  APP_URL: string
  AUTHORIZATION_SECRETS: string
  NOTIFY_URLS: string
}

const app = new Hono<{ Bindings: Bindings }>()

type UserUpdateEvent = {
  user_id: string
  user_metadata: Record<string, unknown>
  blocked: boolean
}

app.get('/.well-known/jwks.json', async (c) => {
  const { publicJwk } = await getSigningMaterial(c.env)
  return c.json({ keys: [publicJwk] })
})

app.post('/webhook', async (c) => {
  const secrets = c.env.AUTHORIZATION_SECRETS.split(',').map(s => s.trim()).filter(s => s !== '')
  const authHeader = c.req.header('Authorization')
  const authorizationToken = authHeader?.replace('Bearer ', '')
  if (!authHeader || !authorizationToken || !secrets.includes(authorizationToken)) {
    return c.json({ message: 'Missing or invalid Authorization header' }, 401)
  }
  const jsonData = await c.req.json()
  const body: UserUpdateEvent = jsonData.data.object

  const { privateKey } = await getSigningMaterial(c.env)
  const token = await signJwt(
    privateKey,
    {
      user_id: body.user_id,
      blocked: body.blocked,
    },
    {
      expiresInSeconds: 300,
    }
  )

  const sendUrls = c.env.NOTIFY_URLS.split(',').map(s => s.trim()).filter(s => s !== '')
  await Promise.all(sendUrls.map(url => fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token }),
  })))

  return c.json({
    message: `User ${body.user_id} updated and JWT generated.`,
    token,
  })

})

export default app
