import NextAuth from "next-auth"
import Auth0 from "next-auth/providers/auth0"
import { Config } from "./config"

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [Auth0({
        clientId: Config.auth0ClientId,
        clientSecret: Config.auth0ClientSecret,
        issuer: `https://${Config.auth0Domain}/`,
        authorization: {
            params: {
                audience: Config.appApiAudience
            }
        },
    }),],
    callbacks: {
        session: async ({ session, token, }) => {
            return { ...session, accessToken: token.accessToken }
        },
        jwt({ token, account }) {
            if (account?.access_token) {
                token.accessToken = account.access_token
            }
            return token
        },
    },
})