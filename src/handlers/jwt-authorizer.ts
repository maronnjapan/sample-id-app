// /me/v1/connected-accounts/* 用の Lambda Authorizer。
// モック Auth0 が発行した My Account API token（RS256 JWT）を検証する。
// （HTTP API のネイティブ JWT Authorizer は OIDC discovery を要求するため、
//  モック発行の鍵で検証できるよう REQUEST 型 Lambda Authorizer にする。）
import type {
  APIGatewayRequestAuthorizerEventV2,
  APIGatewaySimpleAuthorizerWithContextResult,
} from 'aws-lambda';
import { verifyJwt, JwtError } from '../common/jwt';
import { getMockJwtPrivateKey } from '../common/secrets';
import { env } from '../common/env';
import { log } from '../common/logger';

interface AuthContext {
  sub: string;
  scope: string;
  client_id: string;
  [k: string]: string;
}

const deny: APIGatewaySimpleAuthorizerWithContextResult<AuthContext> = {
  isAuthorized: false,
  context: { sub: '', scope: '', client_id: '' },
};

export const handler = async (
  event: APIGatewayRequestAuthorizerEventV2,
): Promise<APIGatewaySimpleAuthorizerWithContextResult<AuthContext>> => {
  const header =
    event.headers?.authorization ?? event.headers?.Authorization ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    log.warn('authorizer: missing bearer token');
    return deny;
  }

  try {
    const privateKey = await getMockJwtPrivateKey();
    const claims = verifyJwt(match[1], privateKey, {
      issuer: env.jwtIssuer,
      audience: env.myAccountAudience,
    });
    return {
      isAuthorized: true,
      context: {
        sub: claims.sub,
        scope: typeof claims.scope === 'string' ? claims.scope : '',
        client_id: typeof claims.azp === 'string' ? claims.azp : '',
      },
    };
  } catch (e) {
    if (e instanceof JwtError) {
      log.warn('authorizer: token rejected', { reason: e.message });
      return deny;
    }
    throw e;
  }
};
