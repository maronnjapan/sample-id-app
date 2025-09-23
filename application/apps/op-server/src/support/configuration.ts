import { Configuration } from "oidc-provider";
import { getClients } from "../db/repository";
import { getPrivateKeys } from "../sign-key/repository";


export const getConfiguration = async (): Promise<Configuration> => {

  const clients = await getClients()
  const keys = await getPrivateKeys()
  return {
    clients: clients.map(c => ({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      grant_types: c.grants,
      redirect_uris: c.redirectUris,
      id_token_signed_response_alg: 'ES256',
    })),
    claims: {
      address: ['address'],
      email: ['email', 'email_verified'],
      phone: ['phone_number', 'phone_number_verified'],
      profile: ['birthdate', 'family_name', 'gender', 'given_name', 'locale', 'middle_name', 'name',
        'nickname', 'picture', 'preferred_username', 'profile', 'updated_at', 'website', 'zoneinfo'],
    },
    features: {
      devInteractions: { enabled: false }, // defaults to true

      deviceFlow: { enabled: true }, // defaults to false
      revocation: { enabled: true }, // defaults to false
    },
    jwks: {
      keys
    },
  };

}