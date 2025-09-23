import { PrismaClient } from "../src/generated/prisma";
import { seedClient } from "./seed-client";
import { seedUser } from "./seed-user";

const prisma = new PrismaClient()
async function main() {
    await seedClient(prisma)
    await seedUser(prisma)
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
    });