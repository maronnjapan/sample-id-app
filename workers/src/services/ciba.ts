import type {
  Bindings,
  CibaAuthResponse,
  CibaPollResult,
  CibaErrorResponse,
} from '../types';

export async function startCibaAuth(
  env: Bindings,
  userEmail: string,
  bindingMessage?: string
): Promise<CibaAuthResponse> {
  const url = `https://${env.OKTA_DOMAIN}/oauth2/v1/bc/authorize`;

  const params = new URLSearchParams({
    client_id: env.OKTA_CLIENT_ID,
    client_secret: env.OKTA_CLIENT_SECRET,
    scope: 'openid',
    login_hint: userEmail,
  });

  if (bindingMessage) {
    params.append('binding_message', bindingMessage);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = (await response.json()) as CibaErrorResponse;
    throw new Error(`CIBA auth failed: ${error.error_description}`);
  }

  return response.json() as Promise<CibaAuthResponse>;
}

export async function pollCibaToken(
  env: Bindings,
  authReqId: string
): Promise<CibaPollResult> {
  const url = `https://${env.OKTA_DOMAIN}/oauth2/v1/token`;

  const params = new URLSearchParams({
    grant_type: 'urn:openid:params:grant-type:ciba',
    client_id: env.OKTA_CLIENT_ID,
    client_secret: env.OKTA_CLIENT_SECRET,
    auth_req_id: authReqId,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (response.ok) {
    const data = (await response.json()) as {
      access_token: string;
      id_token?: string;
    };
    return {
      status: 'approved',
      access_token: data.access_token,
      id_token: data.id_token,
    };
  }

  const error = (await response.json()) as CibaErrorResponse;

  switch (error.error) {
    case 'authorization_pending':
      return { status: 'pending' };
    case 'slow_down':
      return { status: 'slow_down' };
    case 'access_denied':
      return { status: 'rejected', reason: error.error_description };
    case 'expired_token':
      return { status: 'expired' };
    default:
      throw new Error(`CIBA token error: ${error.error_description}`);
  }
}
