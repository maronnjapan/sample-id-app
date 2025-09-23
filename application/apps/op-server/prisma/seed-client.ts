import { PrismaClient } from "../src/generated/prisma";

export const seedClient = async (prisma: PrismaClient) => {
    return await prisma.client.upsert({
        where: { clientId: "oidcCLIENT2222" },
        update: {},
        create: {
            clientId: 'oidcCLIENT2222',
            clientSecret: 'oidcCLIENTsecret2222',
            grants: ['refresh_token', 'authorization_code', 'urn:ietf:params:oauth:grant-type:token-exchange'],
            redirectUris: ['http://localhost:3000/api/auth/callback/my-provider'],
        },
    });
};