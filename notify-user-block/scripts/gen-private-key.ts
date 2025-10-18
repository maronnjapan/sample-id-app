#!/usr/bin/env node

import { readFile, writeFile } from 'fs/promises'
import { resolve } from 'path'

const ENV_KEY_NAME = 'JWT_PRIVATE_KEY'
const ENV_FILE_NAME = process.env.PRIVATE_KEY_ENV_PATH?.trim() || '.env'

const generateKeyPair = async (): Promise<CryptoKeyPair> => {
    if (typeof crypto?.subtle?.generateKey !== 'function') {
        throw new Error('Web Crypto API is unavailable.')
    }

    return await crypto.subtle.generateKey(
        {
            name: 'ECDSA',
            namedCurve: 'P-256'
        },
        true,
        ['sign', 'verify']
    )
}

const exportPrivateKey = async (privateKey: CryptoKey): Promise<string> => {
    const pkcs8 = await crypto.subtle.exportKey('pkcs8', privateKey)
    const bytes = Buffer.from(pkcs8)
    const body = bytes.toString('base64').match(/.{1,64}/g)?.join('\n') ?? ''
    return `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`
}

const writeEnvFile = async (filePath: string, keyName: string, value: string) => {
    const serializedValue = value.replace(/\n/g, '\\n')
    const entry = `${keyName}="${serializedValue}"`

    try {
        const current = await readFile(filePath, 'utf8')
        const pattern = new RegExp(`^${keyName}=.*$`, 'm')
        const updated = pattern.test(current)
            ? current.replace(pattern, entry)
            : current.trimEnd().concat(current.endsWith('\n') ? '' : '\n', entry, '\n')

        await writeFile(filePath, `${updated}`)
    } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            await writeFile(filePath, `${entry}\n`)
            return
        }

        throw error
    }
}

const main = async () => {
    const keyPair = await generateKeyPair()
    const pem = await exportPrivateKey(keyPair.privateKey)
    const envPath = resolve(process.cwd(), ENV_FILE_NAME)

    await writeEnvFile(envPath, ENV_KEY_NAME, pem)

    console.log(`Generated new ECDSA P-256 private key and stored under ${ENV_KEY_NAME}`)
    console.log(`Updated env file: ${envPath}`)
}

main().catch(error => {
    console.error('Failed to generate private key')
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
})
