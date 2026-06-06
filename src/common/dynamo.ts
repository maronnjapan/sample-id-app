// DynamoDB DAO。各テーブルのアクセスをここに閉じ込める。
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { env } from './env';
import type {
  ApiClientRecord,
  ConnectSessionRecord,
  ConnectedAccountRecord,
  PendingConnectionRecord,
  RefreshTokenRecord,
} from '../types';

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

// ---- ApiClients --------------------------------------------------------
export async function getApiClient(clientId: string): Promise<ApiClientRecord | undefined> {
  const res = await doc.send(
    new GetCommand({ TableName: env.tableApiClients, Key: { client_id: clientId } }),
  );
  return res.Item as ApiClientRecord | undefined;
}

// ---- RefreshTokens -----------------------------------------------------
export async function getRefreshToken(
  refreshTokenId: string,
): Promise<RefreshTokenRecord | undefined> {
  const res = await doc.send(
    new GetCommand({
      TableName: env.tableRefreshTokens,
      Key: { refresh_token_id: refreshTokenId },
    }),
  );
  return res.Item as RefreshTokenRecord | undefined;
}

// ---- ConnectedAccounts -------------------------------------------------
function userPk(userId: string): string {
  return `USER#${userId}`;
}
function cacSk(cacId: string): string {
  return `CAC#${cacId}`;
}
export function gsi1Pk(userId: string, connection: string): string {
  return `USER#${userId}#CONN#${connection}`;
}
export function gsi2Pk(connection: string, providerAccountId: string): string {
  return `CONN#${connection}#ACCOUNT#${providerAccountId}`;
}

export async function putConnectedAccount(rec: ConnectedAccountRecord): Promise<void> {
  await doc.send(new PutCommand({ TableName: env.tableConnectedAccounts, Item: rec }));
}

export async function findConnectedAccounts(
  userId: string,
  connection: string,
): Promise<ConnectedAccountRecord[]> {
  const res = await doc.send(
    new QueryCommand({
      TableName: env.tableConnectedAccounts,
      IndexName: env.connectedAccountsGsi1,
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': gsi1Pk(userId, connection) },
    }),
  );
  return (res.Items ?? []) as ConnectedAccountRecord[];
}

export async function listConnectedAccountsForUser(
  userId: string,
): Promise<ConnectedAccountRecord[]> {
  const res = await doc.send(
    new QueryCommand({
      TableName: env.tableConnectedAccounts,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': userPk(userId), ':sk': 'CAC#' },
    }),
  );
  return (res.Items ?? []) as ConnectedAccountRecord[];
}

export async function getConnectedAccount(
  userId: string,
  cacId: string,
): Promise<ConnectedAccountRecord | undefined> {
  const res = await doc.send(
    new GetCommand({
      TableName: env.tableConnectedAccounts,
      Key: { PK: userPk(userId), SK: cacSk(cacId) },
    }),
  );
  return res.Item as ConnectedAccountRecord | undefined;
}

export async function deleteConnectedAccount(userId: string, cacId: string): Promise<void> {
  await doc.send(
    new DeleteCommand({
      TableName: env.tableConnectedAccounts,
      Key: { PK: userPk(userId), SK: cacSk(cacId) },
    }),
  );
}

export function buildConnectedAccountRecord(input: {
  userId: string;
  connectedAccountId: string;
  connection: string;
  provider: string;
  providerAccountId: string;
  grantedScopes: string[];
  accessTokenCt: string;
  refreshTokenCt: string;
  accessTokenExp: number;
  accessType: 'offline' | 'online';
}): ConnectedAccountRecord {
  const nowIso = new Date().toISOString();
  return {
    PK: userPk(input.userId),
    SK: cacSk(input.connectedAccountId),
    connected_account_id: input.connectedAccountId,
    connection: input.connection,
    provider: input.provider,
    provider_account_id: input.providerAccountId,
    granted_scopes: input.grantedScopes,
    access_token_ct: input.accessTokenCt,
    refresh_token_ct: input.refreshTokenCt,
    access_token_exp: input.accessTokenExp,
    access_type: input.accessType,
    created_at: nowIso,
    updated_at: nowIso,
    GSI1PK: gsi1Pk(input.userId, input.connection),
    GSI2PK: gsi2Pk(input.connection, input.providerAccountId),
  };
}

// ---- ConnectSessions ---------------------------------------------------
export async function putConnectSession(rec: ConnectSessionRecord): Promise<void> {
  await doc.send(new PutCommand({ TableName: env.tableConnectSessions, Item: rec }));
}

export async function getConnectSessionByTicket(
  ticket: string,
): Promise<ConnectSessionRecord | undefined> {
  const res = await doc.send(
    new GetCommand({ TableName: env.tableConnectSessions, Key: { ticket } }),
  );
  return res.Item as ConnectSessionRecord | undefined;
}

export async function getConnectSessionByAuthSession(
  authSession: string,
): Promise<ConnectSessionRecord | undefined> {
  const res = await doc.send(
    new QueryCommand({
      TableName: env.tableConnectSessions,
      IndexName: env.connectSessionsAuthSessionIndex,
      KeyConditionExpression: 'auth_session = :a',
      ExpressionAttributeValues: { ':a': authSession },
      Limit: 1,
    }),
  );
  return (res.Items?.[0] as ConnectSessionRecord | undefined) ?? undefined;
}

export async function deleteConnectSession(ticket: string): Promise<void> {
  await doc.send(new DeleteCommand({ TableName: env.tableConnectSessions, Key: { ticket } }));
}

// ---- PendingConnections ------------------------------------------------
export async function putPendingConnection(rec: PendingConnectionRecord): Promise<void> {
  await doc.send(new PutCommand({ TableName: env.tablePendingConnections, Item: rec }));
}

export async function getPendingConnection(
  connectCode: string,
): Promise<PendingConnectionRecord | undefined> {
  const res = await doc.send(
    new GetCommand({ TableName: env.tablePendingConnections, Key: { connect_code: connectCode } }),
  );
  return res.Item as PendingConnectionRecord | undefined;
}

export async function deletePendingConnection(connectCode: string): Promise<void> {
  await doc.send(
    new DeleteCommand({ TableName: env.tablePendingConnections, Key: { connect_code: connectCode } }),
  );
}
