import NextAuth from "next-auth"
import { Config } from "./config"

const MY_PROVIDER_ID = "my-provider"
export const { handlers, auth, signIn, signOut } = NextAuth({
    providers: [
        {
            id: MY_PROVIDER_ID,
            name: "My Provider",
            type: "oidc",
            issuer: Config.myProviderIssuerBaseUrl,
            clientId: Config.myProviderClientId,
            clientSecret: Config.myProviderClientSecret,
        }
    ],

    callbacks: {
        session: async ({ session, token, user, newSession }) => {
            return {
                ...session,
                accessToken: token.accessToken,
                idToken: token.idToken
            }
        },
        jwt: async ({ token, account, user, session
        }) => {
            console.log('JWT callback - account:', account)

            if (account?.provider !== MY_PROVIDER_ID) {
                return token
            }

            if (account?.access_token) {
                token.accessToken = account.access_token
            }

            if (account?.id_token) {
                const idToken = account.id_token
                token.idToken = idToken
            }


            return token
        },
    },
})