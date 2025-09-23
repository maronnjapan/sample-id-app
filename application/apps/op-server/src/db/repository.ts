import prisma from "./prisma";

export const getUser = async ({ email, password }: { email: string, password: string }): Promise<{
    accountId: string;
    email: string;
    password: string;
    name: string | null;
    createdAt: Date;
    updatedAt: Date;
} | null> => {
    const user = await prisma.user.findUnique({
        where: { email },
    });

    if (!user) {
        return null;
    }

    if (user.password !== password) {
        return null;
    }

    return user;
}

export const getClients = async (): Promise<{
    clientId: string;
    clientSecret: string;
    grants: string[];
    redirectUris: string[];
}[]> => {
    return await prisma.client.findMany();
}