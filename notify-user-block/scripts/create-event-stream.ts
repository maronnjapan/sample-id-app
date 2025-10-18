#!/usr/bin/env node

import { ManagementClient, Management } from 'auth0'
import { execSync } from 'child_process'
import * as fs from 'fs'
import path from 'path'
import dotenv from 'dotenv';
dotenv.config();

type RawEnv = Record<string, string | undefined>

type Config = {
  tenantDomain: string
  clientId: string
  clientSecret: string
  webhookEndpoint: string
}

const requiredEnvVars = [
  'AUTH0_TENANT_DOMAIN',
  'AUTH0_MANAGEMENT_CLIENT_ID',
  'AUTH0_MANAGEMENT_CLIENT_SECRET',
  'AUTH0_EVENT_STREAM_WEBHOOK_ENDPOINT',
  'AUTHORIZATION_SECRETS'
]

const getEnv = (): RawEnv => {
  const nodeProcess = (globalThis as { process?: { env?: RawEnv } }).process
  return (nodeProcess?.env ?? {}) as RawEnv
}

const collectEnv = (): Config => {
  const env = getEnv()
  const missing = requiredEnvVars.filter(key => !env[key] || env[key]?.trim() === '')

  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }

  return {
    tenantDomain: env.AUTH0_TENANT_DOMAIN!,
    clientId: env.AUTH0_MANAGEMENT_CLIENT_ID!,
    clientSecret: env.AUTH0_MANAGEMENT_CLIENT_SECRET!,
    webhookEndpoint: env.AUTH0_EVENT_STREAM_WEBHOOK_ENDPOINT!,
  }
}

const buildPayload = (eventStreamParam: {
  eventStreamName: string
  eventTypes: string[]
  webhookEndpoint: string
  webhookToken: string
  status: Management.EventStreamsCreateRequest['status']
}): Management.EventStreamsCreateRequest => ({
  name: eventStreamParam.eventStreamName,
  subscriptions: eventStreamParam.eventTypes.map(eventType => ({ event_type: eventType })),
  destination: {
    type: 'webhook',
    configuration: {
      webhook_endpoint: eventStreamParam.webhookEndpoint,
      webhook_authorization: {
        method: 'bearer',
        // @ts-ignore: これがないとリクエストは通らないが型定義で漏れているので無視する
        token: eventStreamParam.webhookToken
      }
    }
  },
  status: eventStreamParam.status
})

const writeSecretEnvFile = (secret: string) => {
  const envFilePath = path.resolve('.env')
  console.log(`Writing AUTHORIZATION_SECRETS to ${envFilePath}`)
  if (!fs.existsSync(envFilePath)) {
    throw new Error('.env file is not found')
  }
  const envFile = fs.readFileSync(envFilePath, 'utf-8')
  if (!envFile.match(/^AUTHORIZATION_SECRETS=\"[a-zA-Z0-9,]*\"$/m)) {
    throw new Error('.env file is missing AUTHORIZATION_SECRETS variable')
  }
  if (envFile.match(/^AUTHORIZATION_SECRETS=\"\"$/m)) {
    const updated = envFile.replace(/^AUTHORIZATION_SECRETS=\"[a-zA-Z0-9]*\"$/m, `AUTHORIZATION_SECRETS="${secret}"`)
    fs.writeFileSync(envFilePath, updated, 'utf-8')
    return
  }

  const updated = envFile.replace(/^AUTHORIZATION_SECRETS=\"([a-zA-Z0-9,]+)\"$/m, (match, p1: string) => {
    const prevAuthorizationSecrets = p1.split(',').map(s => s.trim()).filter(s => s !== '')
    const latestSecrets = [secret, ...prevAuthorizationSecrets].slice(0, 3)
    console.log(`Previous secrets: ${prevAuthorizationSecrets.join(', ')}`)
    console.log(`Latest secrets: ${latestSecrets.join(', ')}`)
    return `AUTHORIZATION_SECRETS="${latestSecrets.join(',')}"`
  })
  fs.writeFileSync(envFilePath, updated, 'utf-8')

}

const main = async () => {
  const config = collectEnv()

  const client = new ManagementClient({
    domain: config.tenantDomain,
    clientId: config.clientId,
    clientSecret: config.clientSecret
  })



  const secret = crypto.randomUUID().replaceAll('-', '')
  writeSecretEnvFile(secret)

  execSync(`echo ${secret} | wrangler secret put AUTHORIZATION_SECRETS --name notify-user-block`)
  const eventStreamName = 'notifyUserBlock'
  // 取得する値と型定義に差異があるので、型を取得する値に合わせて上書きしている
  const eventStreams = await client.eventStreams.list() as unknown as { eventStreams: Management.EventStreamResponseContent[] }

  const existingId = eventStreams.eventStreams.find(es => es.name === eventStreamName)?.id
  if (existingId) {
    console.log(`Event stream "${eventStreamName}" already exists. Updating...`)
    await client.eventStreams.update(existingId, {
      destination: {
        type: 'webhook',
        configuration: {
          webhook_authorization: {
            // @ts-ignore: ignore type check for token property
            token: secret
          }
        }
      }
    })
    return
  }

  console.log('Creating event stream...')
  const eventStream = await client.eventStreams.create(buildPayload({
    webhookEndpoint: config.webhookEndpoint,
    webhookToken: secret,
    eventStreamName,
    eventTypes: ['user.updated'],
    status: 'enabled'
  }))

  console.log('Event stream created successfully')
  console.log(JSON.stringify(eventStream, null, 2))
}

main().catch(error => {
  console.error('Error while creating event stream')
  console.error(error instanceof Error ? error.message : error)
  const nodeProcess = (globalThis as { process?: { exit?: (code?: number) => never } }).process
  nodeProcess?.exit?.(1)
})
