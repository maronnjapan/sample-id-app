import NextAuth from "next-auth"
import Keycloak from "next-auth/providers/keycloak";

export const { handlers, signIn, signOut, auth, unstable_update } = NextAuth({

    providers: [
        Keycloak({
            clientId: process.env.KEYCLOAK_CLIENT_ID || '',
            clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || '',
            issuer: process.env.KEYCLOAK_URL || '',
            authorization: {
                params: {
                    scope: 'openid profile email',
                }
            },
            token: process.env.KEYCLOAK_URL + '/protocol/openid-connect/token' || '',
        })
    ],
    callbacks: {
        session: async ({ session, token, user, newSession, trigger }) => {

            return { ...session, accessToken: token.accessToken }
        },
        jwt({ token, user, account, profile, session, trigger }) {
            if (account?.access_token) {
                token.accessToken = account.access_token
            }
            return token
        },
    },
})

export const singInKeycloak = async (options?: any) => {
    return signIn('keycloak', options)
}