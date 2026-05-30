import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Datos demo idempotentes (upsert por email/nombre). Sirven para probar la API
 * recién desplegada sin registrarse a mano.
 *   admin@demo.com / admin123   (ADMIN)
 *   ana@demo.com   / demo1234
 *   bob@demo.com   / demo1234
 */
async function main() {
  const hash = (p: string) => bcrypt.hash(p, 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo.com' },
    update: {},
    create: { email: 'admin@demo.com', username: 'admin', password: await hash('admin123'), role: 'ADMIN' },
  });
  const ana = await prisma.user.upsert({
    where: { email: 'ana@demo.com' },
    update: {},
    create: { email: 'ana@demo.com', username: 'ana', password: await hash('demo1234') },
  });
  const bob = await prisma.user.upsert({
    where: { email: 'bob@demo.com' },
    update: {},
    create: { email: 'bob@demo.com', username: 'bob', password: await hash('demo1234') },
  });

  const general = await prisma.room.upsert({
    where: { name: 'general' },
    update: {},
    create: {
      name: 'general',
      createdById: admin.id,
      memberships: { create: [{ userId: admin.id }, { userId: ana.id }, { userId: bob.id }] },
    },
  });

  await prisma.room.upsert({
    where: { name: 'random' },
    update: {},
    create: {
      name: 'random',
      createdById: ana.id,
      memberships: { create: [{ userId: ana.id }, { userId: bob.id }] },
    },
  });

  // Algunos mensajes de muestra solo si la sala general está vacía.
  const count = await prisma.message.count({ where: { roomId: general.id } });
  if (count === 0) {
    await prisma.message.createMany({
      data: [
        { roomId: general.id, senderId: ana.id, body: '¡Hola! Bienvenidos al chat 👋' },
        { roomId: general.id, senderId: bob.id, body: 'Probando el tiempo real…' },
        { roomId: general.id, senderId: admin.id, body: 'Todo funcionando. Escalable con Redis.' },
      ],
    });
  }

  console.log('Seed OK: usuarios demo + salas general/random + mensajes.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
