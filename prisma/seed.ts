import { prisma } from "../src/prisma";

async function main() {
  try {
    // Create a test user
    const user = await prisma.user.upsert({
      where: { username: 'admin' },
      update: {},
      create: {
        username: 'admin',
        password: 'admin', // In a production environment, this should be hashed
      },
    });

    console.log('Test user created:', user);

    // Clean up any old DBSC sessions
    await prisma.dbscSession.deleteMany({});
    console.log('Old DBSC sessions cleared');

  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
