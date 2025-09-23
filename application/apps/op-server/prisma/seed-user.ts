import { PrismaClient } from "../src/generated/prisma";
export const seedUser = async (prisma: PrismaClient) => {
    return await prisma.user.upsert({
        where: { email: "user@example.com" },
        update: {},
        create: {
            email: "user@example.com",
            name: "Example User",
            password: "password",
        },
    });
};