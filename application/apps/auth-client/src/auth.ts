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
            console.log(user)
            console.log(token)
            console.log(session)
            console.log(newSession)
            return {
                ...session,
                // accessToken: token.accessToken, 
                // idToken: token.idToken
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
                const openIdConfigResponse = await fetch(`${Config.myProviderIssuerBaseUrl}/.well-known/openid-configuration`)
                const openIdConfig = await openIdConfigResponse.json()
                if (!openIdConfig.token_endpoint) {
                    throw new Error('No token endpoint found in OpenID configuration')
                }
                const tokenEndpoint = openIdConfig.token_endpoint
                const tokenExchangeResponse = await fetch(tokenEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': 'Basic ' + Buffer.from(Config.myProviderClientId + ':' + Config.myProviderClientSecret).toString('base64')
                    },
                    body: new URLSearchParams({
                        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',

                        subject_token: idToken,
                        subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
                        requested_token_type: 'urn:ietf:params:oauth:token-type:id-jag',
                        audience: 'http://localhost:3000/api',
                        scope: 'openid profile email',
                    })
                })
                const tokenExchangeData = await tokenExchangeResponse.json()
                console.log('Token exchange response:', tokenExchangeData)
                if (tokenExchangeResponse.ok) {
                    token.exchangedToken = tokenExchangeData.access_token
                } else {
                    console.error('Token exchange failed:', tokenExchangeData)
                }
            }


            return token
        },
    },
})