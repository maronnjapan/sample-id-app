export const Config = {
  get auth0ClientId() {
    if (!process.env.AUTH0_ID) {
      throw new Error('AUTH0_ID environment variable is not set')
    }
    return process.env.AUTH0_ID
  },
  get auth0ClientSecret() {
    if (!process.env.AUTH0_SECRET) {
      throw new Error('AUTH0_SECRET environment variable is not set')
    }
    return process.env.AUTH0_SECRET
  },
  get appApiAudience() {
    if (!process.env.AUTH0_AUDIENCE) {
      throw new Error('AUTH0_AUDIENCE environment variable is not set')
    }
    return process.env.AUTH0_AUDIENCE
  },
  get auth0Domain() {
    if (!process.env.AUTH0_DOMAIN) {
      throw new Error('AUTH0_DOMAIN environment variable is not set')
    }
    return process.env.AUTH0_DOMAIN
  },
  get appUrl() {
    if (!process.env.NEXT_PUBLIC_APP_URL) {
      throw new Error('NEXT_PUBLIC_APP_URL environment variable is not set')
    }
    return process.env.NEXT_PUBLIC_APP_URL
  },
  get userBlockAppUrl() {
    if (!process.env.USER_BLOCK_APP_URL) {
      throw new Error('USER_BLOCK_APP_URL environment variable is not set')
    }
    return process.env.USER_BLOCK_APP_URL
  },
}
