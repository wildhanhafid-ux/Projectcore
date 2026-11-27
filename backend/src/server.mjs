import { registerProjectResources } from './project-resources.mjs';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';

process.loadEnvFile && (() => {
  try { process.loadEnvFile(); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
})();

const db = new PrismaClient();
const app = express();
const production = process.env.NODE_ENV === 'production';
const origin = new URL(process.env.APP_URL || 'http://localhost:3000').origin;
if (production && (!process.env.APP_URL || !origin.startsWith('https://'))) {
  throw new Error('APP_URL HTTPS wajib untuk produksi.');
}
const maxAge = 8 * 60 * 60 * 1000;
const cookieName = production ? '__Host-projectcore' : 'projectcore';
const cookieOptions = { httpOnly: true, secure: production, sameSite: 'strict', path: '/' };
const hash = token => createHash('sha256').update(token).digest('hex');
const tokenSchema = /^[a-f0-9]{64}$/;
const dummyHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
const publicUser = ({ id, username, name, theme, isAdmin, mustChangePassword }) =>
  ({ id, username, name, theme, isAdmin, mustChangePassword });
const respond = (res, data) => res.json({ data });
const fail = (res, status, message) => res.status(status).json({ error: { message } });
const projectScope = user => user.isAdmin ? {} : { members: { some: { userId: user.id } } };

app.set('trust proxy', 'loopback');
app.disable('x-powered-by');
app.use(helmet({ strictTransportSecurity: production ? undefined : false }));
app.use(express.json({ limit: '32kb' }));
app.get('/health', async (_req, res) => {
  try {
    await db.$queryRaw`SELECT 1`;
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'unavailable' });
  }
});

const api = express.Router();
app.use('/api/v1', api);
api.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('origin') !== origin) {
    return fail(res, 403, 'Asal permintaan tidak diizinkan.');
  }
  next();
});

api.post('/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000, limit: 12,
  handler: (_req, res) => fail(res, 429, 'Terlalu banyak percobaan login.')
}), async (req, res) => {
  const { username, password } = z.object({
    username: z.string().trim().toLowerCase().min(1).max(80),
    password: z.string().min(1).refine(value => Buffer.byteLength(value) <= 72)
  }).parse(req.body);
  const user = await db.user.findUnique({ where: { username } });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);
  if (!valid || !user?.active) return fail(res, 401, 'Username atau password salah.');
  const token = randomBytes(32).toString('hex');
  await db.session.create({
    data: { tokenHash: hash(token), userId: user.id, expiresAt: new Date(Date.now() + maxAge) }
  });
  res.cookie(cookieName, token, { ...cookieOptions, maxAge });
  respond(res, publicUser(user));
});

api.use(async (req, res, next) => {
  const entry = req.headers.cookie?.split(';').map(value => value.trim())
    .find(value => value.startsWith(cookieName + '='));
  const token = entry?.slice(cookieName.length + 1);
  if (!token || !tokenSchema.test(token)) return fail(res, 401, 'Silakan masuk.');
  const session = await db.session.findUnique({ where: { tokenHash: hash(token) }, include: { user: true } });
  if (!session?.user.active || session.expiresAt <= new Date()) return fail(res, 401, 'Sesi berakhir.');
  req.session = session;
  req.user = session.user;
  next();
});

api.get('/auth/me', (req, res) => respond(res, publicUser(req.user)));
api.post('/auth/logout', async (req, res) => {
  await db.session.deleteMany({ where: { tokenHash: req.session.tokenHash } });
  res.clearCookie(cookieName, cookieOptions).sendStatus(204);
});
api.post('/auth/password', async (req, res) => {
  const { current, password } = z.object({
    current: z.string().min(1).refine(value => Buffer.byteLength(value) <= 72),
    password: z.string().min(14).refine(value => Buffer.byteLength(value) <= 72)
  }).parse(req.body);
  if (!(await bcrypt.compare(current, req.user.passwordHash))) {
    return fail(res, 403, 'Password saat ini salah.');
  }
  if (current === password) return fail(res, 400, 'Gunakan password baru.');
  const passwordHash = await bcrypt.hash(password, 12);
  const updated = await db.$transaction(async tx => {
    const result = await tx.user.updateMany({
      where: { id: req.user.id, passwordHash: req.user.passwordHash },
      data: { passwordHash, mustChangePassword: false }
    });
    if (!result.count) return false;
    await tx.session.deleteMany({ where: { userId: req.user.id } });
    return true;
  });
  if (!updated) return fail(res, 409, 'Password telah berubah. Masuk kembali.');
  res.clearCookie(cookieName, cookieOptions).sendStatus(204);
});

api.use((req, res, next) => {
  if (req.user.mustChangePassword) return fail(res, 403, 'Ganti password awal terlebih dahulu.');
  next();
});
api.patch('/auth/preferences', async (req, res) => {
  const { theme } = z.object({ theme: z.enum(['clean', 'dark']) }).parse(req.body);
  const user = await db.user.update({ where: { id: req.user.id }, data: { theme } });
  respond(res, publicUser(user));
});

const projectInput = z.object({
  name: z.string().trim().min(1).max(180),
  category: z.string().trim().min(1).max(120),
  description: z.string().trim().max(10000),
  status: z.enum(['active', 'completed', 'on_hold', 'archived']),
  deadline: z.iso.date().nullable()
});
const projectData = ({ deadline, ...data }) => ({
  ...data, deadline: deadline ? new Date(deadline + 'T00:00:00.000Z') : null
});
const idFrom = req => z.coerce.number().int().positive().parse(req.params.id);
const adminOnly = (req, res, next) => req.user.isAdmin ? next() : fail(res, 403, 'Akses ditolak.');

api.get('/projects', async (req, res) => {
  const pagination = z.object({
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(50)
  }).parse(req.query);
  const where = projectScope(req.user);
  const [projects, total, active, completed] = await db.$transaction([
    db.project.findMany({
      where, skip: pagination.offset, take: pagination.limit,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      include: { favorites: { where: { userId: req.user.id }, select: { userId: true } } }
    }),
    db.project.count({ where }),
    db.project.count({ where: { ...where, status: 'active' } }),
    db.project.count({ where: { ...where, status: 'completed' } })
  ]);
  respond(res, { projects: projects.map(({ favorites, ...project }) => ({
    ...project, favorite: Boolean(favorites.length)
  })), total, active, completed });
});
api.post('/projects', adminOnly, async (req, res) => {
  const project = await db.project.create({ data: projectData(projectInput.parse(req.body)) });
  res.status(201).json({ data: project });
});
api.patch('/projects/:id', adminOnly, async (req, res) => {
  const project = await db.project.update({
    where: { id: idFrom(req) }, data: projectData(projectInput.parse(req.body))
  });
  respond(res, project);
});
api.put('/projects/:id/favorite', async (req, res) => {
  const projectId = idFrom(req);
  const { favorite } = z.object({ favorite: z.boolean() }).parse(req.body);
  const userId = req.user.id;
  const project = await db.project.findFirst({ where: { id: projectId, ...projectScope(req.user) } });
  if (!project) return fail(res, 404, 'Proyek tidak ditemukan.');
  if (favorite) {
    await db.favorite.upsert({
      where: { userId_projectId: { userId, projectId } }, create: { userId, projectId }, update: {}
    });
  } else {
    await db.favorite.deleteMany({ where: { userId, projectId } });
  }
  respond(res, { favorite });
});
const taskInput = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(10000),
  pic: z.string().trim().max(160),
  deadline: z.iso.date().nullable(),
  done: z.boolean(),
  assigneeId: z.number().int().positive().nullable().optional()
});

async function taskData(input, projectId) {
  const data = taskInput.parse(input);
  if (data.assigneeId && !(await db.user.findFirst({ where: {
    id: data.assigneeId, active: true,
    OR: [{ isAdmin: true }, { memberships: { some: { projectId } } }]
  } }))) return null;
  return projectData(data);
}

api.get('/projects/:id/task-assignees', adminOnly, async (req, res) => {
  const projectId = idFrom(req);
  respond(res, await db.user.findMany({
    where: { active: true, OR: [{ isAdmin: true }, { memberships: { some: { projectId } } }] },
    select: { id: true, name: true, username: true },
    orderBy: { username: 'asc' }
  }));
});

api.get('/tasks', async (req, res) => {
  const { view, month } = z.object({
    view: z.enum(['mine', 'calendar']),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional()
  }).parse(req.query);
  const project = projectScope(req.user);
  if (view === 'mine') {
    return respond(res, await db.projectTask.findMany({
      where: { project, assigneeId: req.user.id },
      include: { project: { select: { id: true, name: true } } },
      orderBy: [{ done: 'asc' }, { deadline: 'asc' }, { id: 'asc' }]
    }));
  }
  if (!month) return fail(res, 400, 'Pilih bulan kalender.');
  const start = new Date(month + '-01T00:00:00.000Z');
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const deadline = { gte: start, lt: end };
  const [tasks, projects] = await Promise.all([
    db.projectTask.findMany({
      where: { project, deadline },
      include: { project: { select: { id: true, name: true } } },
      orderBy: [{ deadline: 'asc' }, { id: 'asc' }]
    }),
    db.project.findMany({
      where: { ...project, deadline }, select: { id: true, name: true, deadline: true },
      orderBy: [{ deadline: 'asc' }, { id: 'asc' }]
    })
  ]);
  respond(res, { tasks, projects });
});

api.get('/projects/:id/tasks', async (req, res) => {
  const projectId = idFrom(req);
  const project = await db.project.findFirst({ where: { id: projectId, ...projectScope(req.user) } });
  if (!project) return fail(res, 404, 'Proyek tidak ditemukan.');
  respond(res, await db.projectTask.findMany({ where: { projectId }, orderBy: { id: 'asc' } }));
});

api.post('/projects/:id/tasks', adminOnly, async (req, res) => {
  const projectId = idFrom(req);
  if (!(await db.project.findUnique({ where: { id: projectId } }))) {
    return fail(res, 404, 'Proyek tidak ditemukan.');
  }
  const data = await taskData(req.body, projectId);
  if (!data) return fail(res, 400, 'Akun belum mendapat akses proyek.');
  const task = await db.projectTask.create({ data: { projectId, ...data } });
  res.status(201).json({ data: task });
});

api.patch('/projects/:id/tasks/:taskId', adminOnly, async (req, res) => {
  const projectId = idFrom(req);
  const id = z.coerce.number().int().positive().parse(req.params.taskId);
  const data = req.body && typeof req.body === 'object' && 'title' in req.body
    ? await taskData(req.body, projectId)
    : z.object({ done: z.boolean() }).strict().parse(req.body);
  if (!data) return fail(res, 400, 'Akun belum mendapat akses proyek.');
  respond(res, await db.projectTask.update({ where: { id, projectId }, data }));
});

registerProjectResources(api, { db, projectScope, adminOnly, idFrom, fail, respond });

api.use((_req, res) => fail(res, 404, 'Endpoint tidak ditemukan.'));

const staticRoot = fileURLToPath(new URL('../../dist/', import.meta.url));
app.use(express.static(staticRoot));
app.get('/', (_req, res) => res.sendFile('index.html', { root: staticRoot }));
app.use((error, _req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof z.ZodError || error.type === 'entity.parse.failed') {
    return fail(res, 400, 'Periksa kembali data yang dimasukkan.');
  }
  if (error.type === 'entity.too.large') return fail(res, 413, 'Ukuran permintaan terlalu besar.');
  if (error.code === 'P2025') return fail(res, 404, 'Data tidak ditemukan.');
  console.error('Request failed:', error.code || error.name);
  fail(res, 500, 'Terjadi kesalahan pada server.');
});
app.listen(Number(process.env.PORT || 3000), async () => {
  const username = process.env.INITIAL_ADMIN_USERNAME?.trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  if (!username && !password) return;
  if (!username || username.length > 80 || !password ||
      password.length < 14 || Buffer.byteLength(password) > 72) {
    console.error('ProjectCore: periksa username dan panjang password bootstrap (14–72 byte).');
    return;
  }
  try {
    if (await db.user.findFirst({ where: { isAdmin: true } })) return;
    await db.user.upsert({
      where: { username },
      update: {},
      create: { username, name: 'Administrator', passwordHash: await bcrypt.hash(password, 12), isAdmin: true }
    });
    if (await db.user.findFirst({ where: { isAdmin: true } })) {
      console.info('ProjectCore: akun administrator tersedia.');
    } else {
      console.error('ProjectCore: username bootstrap sudah dipakai.');
    }
  } catch (error) {
    console.error('ProjectCore: bootstrap gagal:', error.code || error.name);
  }
});
