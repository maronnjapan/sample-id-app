import * as path from 'node:path';
import {
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
  CfnOutput,
  aws_apigatewayv2 as apigwv2,
  aws_cloudtrail as cloudtrail,
  aws_dynamodb as dynamodb,
  aws_kms as kms,
  aws_lambda as lambda,
  aws_logs as logs,
  aws_s3 as s3,
  aws_secretsmanager as secretsmanager,
} from 'aws-cdk-lib';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import {
  HttpLambdaAuthorizer,
  HttpLambdaResponseType,
} from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { Construct } from 'constructs';

const CONNECT_ENTRY_PATH = '/connected-accounts/connect';
const PROVIDER_CALLBACK_PATH = '/_internal/provider-callback';
const GSI1 = 'GSI1';
const GSI2 = 'GSI2';
const CONNECT_SESSIONS_AUTHSESSION_INDEX = 'AuthSessionIndex';

export class TokenVaultStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // ---- KMS CMK（Step1〜3: Direct Encryption） -----------------------
    // 検証用途のため cdk destroy で確実に消えるよう DESTROY + 最短待機。
    const key = new kms.Key(this, 'TokenVaultKey', {
      alias: 'alias/token-vault',
      description: 'Token Vault: encrypt/decrypt external provider tokens',
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.DESTROY,
      pendingWindow: Duration.days(7),
    });

    // ---- Secrets Manager（provider client_secret + モック JWT 秘密鍵） --
    const providerSecret = new secretsmanager.Secret(this, 'ProviderSecret', {
      secretName: 'token-vault/providers',
      description: 'provider client_id/secret と モック Auth0 の RS256 秘密鍵',
      removalPolicy: RemovalPolicy.DESTROY,
      secretObjectValue: {},
    });

    // ---- DynamoDB テーブル -------------------------------------------
    const connectedAccounts = new dynamodb.Table(this, 'ConnectedAccounts', {
      tableName: 'ConnectedAccounts',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    connectedAccounts.addGlobalSecondaryIndex({
      indexName: GSI1,
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    connectedAccounts.addGlobalSecondaryIndex({
      indexName: GSI2,
      partitionKey: { name: 'GSI2PK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const connectSessions = new dynamodb.Table(this, 'ConnectSessions', {
      tableName: 'ConnectSessions',
      partitionKey: { name: 'ticket', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: RemovalPolicy.DESTROY,
    });
    connectSessions.addGlobalSecondaryIndex({
      indexName: CONNECT_SESSIONS_AUTHSESSION_INDEX,
      partitionKey: { name: 'auth_session', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const pendingConnections = new dynamodb.Table(this, 'PendingConnections', {
      tableName: 'PendingConnections',
      partitionKey: { name: 'connect_code', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const refreshTokens = new dynamodb.Table(this, 'RefreshTokens', {
      tableName: 'RefreshTokens',
      partitionKey: { name: 'refresh_token_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const apiClients = new dynamodb.Table(this, 'ApiClients', {
      tableName: 'ApiClients',
      partitionKey: { name: 'client_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // ---- Lambda 共通設定 ---------------------------------------------
    const jwtIssuer = this.node.tryGetContext('jwtIssuer') ?? 'https://mock-auth0.example.com/';
    const myAccountAudience =
      this.node.tryGetContext('myAccountAudience') ?? 'https://token-vault.example.com/me/';

    const commonEnv: Record<string, string> = {
      TABLE_CONNECTED_ACCOUNTS: connectedAccounts.tableName,
      TABLE_CONNECT_SESSIONS: connectSessions.tableName,
      TABLE_PENDING_CONNECTIONS: pendingConnections.tableName,
      TABLE_REFRESH_TOKENS: refreshTokens.tableName,
      TABLE_API_CLIENTS: apiClients.tableName,
      CONNECTED_ACCOUNTS_GSI1: GSI1,
      CONNECTED_ACCOUNTS_GSI2: GSI2,
      CONNECT_SESSIONS_AUTHSESSION_INDEX: CONNECT_SESSIONS_AUTHSESSION_INDEX,
      KMS_KEY_ID: key.keyArn,
      PROVIDER_SECRET_NAME: providerSecret.secretName,
      JWT_ISSUER: jwtIssuer,
      MY_ACCOUNT_AUDIENCE: myAccountAudience,
      CONNECT_ENTRY_PATH: CONNECT_ENTRY_PATH,
      PROVIDER_CALLBACK_PATH: PROVIDER_CALLBACK_PATH,
    };

    const makeFn = (logicalId: string, entry: string): NodejsFunction => {
      const fn = new NodejsFunction(this, logicalId, {
        entry: path.join(__dirname, '..', 'src', 'handlers', entry),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_22_X,
        memorySize: 256,
        timeout: Duration.seconds(15),
        environment: commonEnv,
        bundling: {
          // AWS SDK v3 は Lambda ランタイムに同梱されているため bundle しない。
          externalModules: ['@aws-sdk/*'],
          minify: true,
          target: 'node22',
        },
        logGroup: new logs.LogGroup(this, `${logicalId}Logs`, {
          retention: logs.RetentionDays.TWO_WEEKS,
          removalPolicy: RemovalPolicy.DESTROY,
        }),
      });
      return fn;
    };

    const oauthTokenFn = makeFn('OauthTokenFn', 'oauth-token.ts');
    const connectedAccountsFn = makeFn('ConnectedAccountsFn', 'connected-accounts.ts');
    const browserFlowFn = makeFn('BrowserFlowFn', 'browser-flow.ts');
    const jwtAuthorizerFn = makeFn('JwtAuthorizerFn', 'jwt-authorizer.ts');

    // ---- IAM（最小権限） ----------------------------------------------
    // /oauth/token: refresh/client/account を読み、refresh 時に account を更新。
    refreshTokens.grantReadData(oauthTokenFn);
    apiClients.grantReadData(oauthTokenFn);
    connectedAccounts.grantReadWriteData(oauthTokenFn);
    key.grantEncryptDecrypt(oauthTokenFn);
    providerSecret.grantRead(oauthTokenFn);

    // My Account API: connect/complete/list/delete。
    connectedAccounts.grantReadWriteData(connectedAccountsFn);
    connectSessions.grantReadWriteData(connectedAccountsFn);
    pendingConnections.grantReadWriteData(connectedAccountsFn);
    key.grantEncryptDecrypt(connectedAccountsFn);

    // ブラウザ動線: session 読み、pending 書き、provider と交換。
    connectSessions.grantReadData(browserFlowFn);
    pendingConnections.grantReadWriteData(browserFlowFn);
    key.grantEncrypt(browserFlowFn);
    providerSecret.grantRead(browserFlowFn);

    // Authorizer: モック JWT 秘密鍵のみ。
    providerSecret.grantRead(jwtAuthorizerFn);

    // ---- API Gateway (HTTP API) --------------------------------------
    const httpApi = new apigwv2.HttpApi(this, 'TokenVaultApi', {
      apiName: 'token-vault',
      description: 'Auth0 互換 Token Vault エンドポイント',
    });

    const authorizer = new HttpLambdaAuthorizer('MyAccountAuthorizer', jwtAuthorizerFn, {
      responseTypes: [HttpLambdaResponseType.SIMPLE],
      identitySource: ['$request.header.Authorization'],
      resultsCacheTtl: Duration.seconds(0),
    });

    // POST /oauth/token（Lambda 本体で検証。Authorizer なし）
    httpApi.addRoutes({
      path: '/oauth/token',
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('OauthTokenInteg', oauthTokenFn),
    });

    // /me/v1/connected-accounts/*（JWT Authorizer 配下）
    const caInteg = new HttpLambdaIntegration('ConnectedAccountsInteg', connectedAccountsFn);
    const meRoutes: Array<{ path: string; method: apigwv2.HttpMethod }> = [
      { path: '/me/v1/connected-accounts/connect', method: apigwv2.HttpMethod.POST },
      { path: '/me/v1/connected-accounts/complete', method: apigwv2.HttpMethod.POST },
      { path: '/me/v1/connected-accounts/connections', method: apigwv2.HttpMethod.GET },
      { path: '/me/v1/connected-accounts/accounts', method: apigwv2.HttpMethod.GET },
      {
        path: '/me/v1/connected-accounts/accounts/{connectedAccountId}',
        method: apigwv2.HttpMethod.DELETE,
      },
    ];
    for (const r of meRoutes) {
      httpApi.addRoutes({
        path: r.path,
        methods: [r.method],
        integration: caInteg,
        authorizer,
      });
    }

    // ブラウザ動線（Authorizer なし。ticket / session 検証で守る）
    const bfInteg = new HttpLambdaIntegration('BrowserFlowInteg', browserFlowFn);
    httpApi.addRoutes({
      path: CONNECT_ENTRY_PATH,
      methods: [apigwv2.HttpMethod.GET],
      integration: bfInteg,
    });
    httpApi.addRoutes({
      path: PROVIDER_CALLBACK_PATH,
      methods: [apigwv2.HttpMethod.GET],
      integration: bfInteg,
    });

    // ---- CloudTrail（KMS / Secrets Manager 呼び出し監査） --------------
    const trailBucket = new s3.Bucket(this, 'TrailBucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      enforceSSL: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });
    new cloudtrail.Trail(this, 'AuditTrail', {
      bucket: trailBucket,
      includeGlobalServiceEvents: true,
      isMultiRegionTrail: false,
    });

    // ---- 出力 --------------------------------------------------------
    new CfnOutput(this, 'ApiBaseUrl', { value: httpApi.apiEndpoint });
    new CfnOutput(this, 'KmsKeyArn', { value: key.keyArn });
    new CfnOutput(this, 'ProviderSecretName', { value: providerSecret.secretName });
    new CfnOutput(this, 'ConnectUri', {
      value: `${httpApi.apiEndpoint}${CONNECT_ENTRY_PATH}`,
    });
  }
}
