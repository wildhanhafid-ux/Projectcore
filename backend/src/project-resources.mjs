import { randomBytes } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, join } from 'node:path';
import express from 'express';
import PDFDocument from 'pdfkit';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

const formats = {
  '.pdf': ['document', 'application/pdf', bytes => bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))],
  '.png': ['photo', 'image/png', bytes => bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))],
  '.jpg': ['photo', 'image/jpeg', bytes => bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))],
};
formats['.jpeg'] = formats['.jpg'];
const assetSelect = { id: true, name: true, kind: true, mime: true, size: true, createdAt: true };
const transactionInput = z.object({
  kind: z.enum(['in', 'out']),
  amount: z.string().regex(/^\d{1,14}(\.\d{1,2})?$/).refine(value => new Prisma.Decimal(value).gt(0)),
  description: z.string().trim().min(1).max(255),
  date: z.iso.date()
});

export function registerProjectResources(api, { db, projectScope, adminOnly, idFrom, fail, respond }) {
  const storage = process.env.PROJECTCORE_STORAGE_PATH;
  const hasStorage = Boolean(storage && isAbsolute(storage));
  async function requireProject(req, res, next) {
    const project = await db.project.findFirst({ where: { id: idFrom(req), ...projectScope(req.user) } });
    if (!project) return fail(res, 404, 'Proyek tidak ditemukan.');
    req.resourceProject = project;
    next();
  }

  api.get('/projects/:id/assets', requireProject, async (req, res) => {
    const kind = z.enum(['document', 'photo']).parse(req.query.kind);
    const assets = await db.projectAsset.findMany({
      where: { projectId: req.resourceProject.id, kind },
      orderBy: { id: 'desc' }, select: assetSelect
    });
    respond(res, { assets, storageReady: hasStorage });
  });

  api.post('/projects/:id/assets', adminOnly, requireProject,
    express.raw({ type: 'application/octet-stream', limit: '10mb' }), async (req, res) => {
      if (!hasStorage) return fail(res, 503, 'Penyimpanan privat belum dikonfigurasi.');
      const { name, kind } = z.object({
        name: z.string().trim().min(1).max(180).regex(/^[^/\\\x00-\x1f\x7f]+$/),
        kind: z.enum(['document', 'photo'])
      }).parse(req.query);
      const format = formats[extname(name).toLowerCase()];
      if (!format || format[0] !== kind || !Buffer.isBuffer(req.body) || !format[2](req.body)) {
        return fail(res, 400, 'Format berkas tidak didukung atau isi berkas tidak cocok.');
      }
      await mkdir(storage, { recursive: true, mode: 0o700 });
      const storageKey = randomBytes(24).toString('hex');
      const filePath = join(storage, storageKey);
      await writeFile(filePath, req.body, { flag: 'wx', mode: 0o600 });
      try {
        const asset = await db.projectAsset.create({
          data: { projectId: req.resourceProject.id, name, kind, mime: format[1], size: req.body.length, storageKey },
          select: assetSelect
        });
        res.status(201).json({ data: asset });
      } catch (error) {
        await unlink(filePath).catch(() => {});
        throw error;
      }
    });

  api.get('/projects/:id/assets/:assetId', requireProject, async (req, res, next) => {
    const id = z.coerce.number().int().positive().parse(req.params.assetId);
    const asset = await db.projectAsset.findFirst({ where: { id, projectId: req.resourceProject.id } });
    if (!asset || !hasStorage) return fail(res, 404, 'Berkas tidak tersedia.');
    const filePath = join(storage, asset.storageKey);
    const complete = error => {
      if (!error) return;
      if (!res.headersSent && error.code === 'ENOENT') return fail(res, 404, 'Berkas tidak tersedia.');
      next(error);
    };
    if (asset.kind === 'photo' && req.query.preview === '1') {
      res.type(asset.mime).sendFile(filePath, complete);
    } else {
      res.download(filePath, asset.name, complete);
    }
  });

  api.get('/projects/:id/transactions', adminOnly, requireProject, async (req, res) => {
    const transactions = await db.projectTransaction.findMany({
      where: { projectId: req.resourceProject.id }, orderBy: [{ date: 'desc' }, { id: 'desc' }]
    });
    let income = new Prisma.Decimal(0);
    let expense = new Prisma.Decimal(0);
    for (const transaction of transactions) {
      if (transaction.kind === 'in') income = income.plus(transaction.amount);
      else expense = expense.plus(transaction.amount);
    }
    respond(res, { transactions, income: income.toFixed(2), expense: expense.toFixed(2), balance: income.minus(expense).toFixed(2) });
  });

  api.post('/projects/:id/transactions', adminOnly, requireProject, async (req, res) => {
    const { date, ...data } = transactionInput.parse(req.body);
    const transaction = await db.projectTransaction.create({
      data: { ...data, projectId: req.resourceProject.id, date: new Date(date + 'T00:00:00Z') }
    });
    res.status(201).json({ data: transaction });
  });

  api.get('/projects/:id/report.pdf', requireProject, async (req, res) => {
    const project = req.resourceProject;
    const [tasks, assets] = await Promise.all([
      db.projectTask.findMany({ where: { projectId: project.id }, orderBy: { id: 'asc' } }),
      db.projectAsset.findMany({ where: { projectId: project.id }, orderBy: { id: 'asc' }, select: assetSelect })
    ]);
    res.type('application/pdf').attachment('ProjectCore-' + project.id + '.pdf');
    const pdf = new PDFDocument({ size: 'A4', margin: 48, info: { Title: 'Ringkasan ProjectCore' } });
    pdf.on('error', error => res.destroy(error));
    res.on('close', () => { if (!res.writableEnded) pdf.destroy(); });
    pdf.pipe(res);
    pdf.fontSize(22).text(project.name).moveDown(0.5);
    pdf.fontSize(11).text(project.category).moveDown().text(project.description || 'Belum ada deskripsi.');
    pdf.moveDown().fontSize(15).text('Daftar tugas').fontSize(11);
    if (!tasks.length) pdf.text('Belum ada tugas.');
    for (const task of tasks) {
      pdf.text(task.title + ' | ' + (task.done ? 'Selesai' : 'Belum selesai') + ' | ' + (task.deadline?.toISOString().slice(0, 10) ?? '-'));
    }
    pdf.moveDown().fontSize(15).text('Dokumen dan foto').fontSize(11);
    if (!assets.length) pdf.text('Belum ada berkas.');
    for (const asset of assets) pdf.text(asset.name);
    pdf.end();
  });
}
