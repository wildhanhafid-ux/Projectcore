import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
try {
  const username = process.env.INITIAL_ADMIN_USERNAME?.trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  if (!username || username.length > 80 || !password ||
      password.length < 14 || Buffer.byteLength(password) > 72) {
    throw new Error('Atur username awal dan password 14–72 byte.');
  }
  if (!(await db.user.findFirst({ where: { isAdmin: true } }))) {
    await db.user.upsert({
      where: { username },
      update: {},
      create: { username, name: 'Administrator', passwordHash: await bcrypt.hash(password, 12), isAdmin: true }
    });
    if (!(await db.user.findFirst({ where: { isAdmin: true } }))) {
      throw new Error('Username awal sudah digunakan oleh akun lain.');
    }
  }
} finally {
  await db.$disconnect();
}
