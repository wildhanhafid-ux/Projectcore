import { useEffect, useState } from 'react';

export type ResourcePage = 'Dokumen' | 'Galeri Foto' | 'Keuangan' | 'Pusat Laporan';
type Asset = { id: number; name: string; size: number };
type Assets = { assets: Asset[]; storageReady: boolean };
type Finance = {
  income: string; expense: string; balance: string;
  transactions: { id: number; description: string; amount: string; kind: 'in' | 'out'; date: string }[];
};
type ProjectOption = { id: number; name: string };
const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' });
const jakartaDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' });

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? 'Permintaan gagal.');
  return result.data;
}

export function ProjectResources({ page, projects, canEdit, loading }: {
  page: ResourcePage; projects: ProjectOption[]; canEdit: boolean; loading: boolean;
}) {
  const [selected, setSelected] = useState<number>();
  const projectId = projects.find(item => item.id === selected)?.id ?? projects[0]?.id;
  const project = projects.find(item => item.id === projectId);
  return <>
    <header><h1>{page}</h1>
      {projects.length > 0 && <label>Proyek
        <select value={projectId} onChange={event => setSelected(Number(event.target.value))}>
          {projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>}
    </header>
    {projectId ? <ProjectResource key={projectId} page={page} projectId={projectId} canEdit={canEdit} /> :
      <p className="card settings" role="status">{loading ? 'Memuat proyek…' : 'Belum ada proyek yang dapat diakses.'}</p>}
    {project && page === 'Pusat Laporan' && <p className="muted">Ringkasan mencakup proyek, tugas, dan daftar berkas {project.name}.</p>}
  </>;
}

function ProjectResource({ page, projectId, canEdit }: {
  page: ResourcePage; projectId: number; canEdit: boolean;
}) {
  const [assets, setAssets] = useState<Assets>();
  const [finance, setFinance] = useState<Finance>();
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const base = '/api/v1/projects/' + projectId;
  const photo = page === 'Galeri Foto';
  const kind = photo ? 'photo' : 'document';
  const assetUrl = base + '/assets?kind=' + kind;
  const financeUrl = base + '/transactions';

  useEffect(() => {
    if (page === 'Pusat Laporan') return;
    const controller = new AbortController();
    const options = { signal: controller.signal };
    const load = page === 'Keuangan'
      ? request<Finance>(financeUrl, options).then(value => { if (!controller.signal.aborted) setFinance(value); })
      : request<Assets>(assetUrl, options).then(value => { if (!controller.signal.aborted) setAssets(value); });
    load.catch((err: Error) => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [page, assetUrl, financeUrl, revision]);

  async function submit(operation: () => Promise<unknown>, form: HTMLFormElement) {
    setBusy(true);
    setError('');
    try {
      await operation();
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Permintaan gagal.');
    } finally {
      setRevision(value => value + 1);
      setBusy(false);
    }
  }

  if (page === 'Pusat Laporan') return <section className="card settings">
    <h2>Ringkasan Proyek</h2>
    <a href={base + '/report.pdf'}>Unduh laporan PDF</a>
  </section>;

  return <section className="card settings">
    {error && <p role="alert" className="notice">{error}</p>}
    {page === 'Keuangan' ? <>
      {finance ? <>
        <div className="grid">
          <div><small>Pemasukan</small><p>{money.format(Number(finance.income))}</p></div>
          <div><small>Pengeluaran</small><p>{money.format(Number(finance.expense))}</p></div>
          <div><small>Saldo</small><p>{money.format(Number(finance.balance))}</p></div>
        </div>
        {!finance.transactions.length && <p className="muted">Belum ada transaksi.</p>}
        {finance.transactions.map(item => <article key={item.id} className="row">
          <p>{item.date.slice(0, 10)} · {item.description}</p>
          <p>{item.kind === 'in' ? '+' : '−'}{money.format(Number(item.amount))}</p>
        </article>)}
      </> : !error && <p role="status">Memuat transaksi…</p>}
      {canEdit && <form onSubmit={event => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = Object.fromEntries(new FormData(form));
        void submit(() => request(financeUrl, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
        }), form);
      }}>
        <h2>Tambah transaksi</h2>
        <label>Jenis<select name="kind"><option value="in">Pemasukan</option><option value="out">Pengeluaran</option></select></label>
        <label>Tanggal<input type="date" name="date" defaultValue={jakartaDate.format(new Date())} required /></label>
        <label>Keterangan<input name="description" maxLength={255} required /></label>
        <label>Nominal (Rp)<input name="amount" type="number" min="0.01" max="99999999999999.99" step="0.01" required /></label>
        <button className="primary" disabled={busy}>Simpan transaksi</button>
      </form>}
    </> : <>
      {!assets && !error && <p role="status">Memuat berkas…</p>}
      {assets && !assets.assets.length && <p className="muted">{photo ? 'Belum ada foto.' : 'Belum ada dokumen.'}</p>}
      {assets && !assets.storageReady && <p>Penyimpanan privat belum dikonfigurasi.</p>}
      <div className={photo ? 'grid' : undefined}>
        {assets?.assets.map(asset => <article key={asset.id} className={photo ? 'card' : undefined}>
          {photo && <a href={base + '/assets/' + asset.id + '?preview=1'} target="_blank" rel="noreferrer">
            <img className="gallery-photo" src={base + '/assets/' + asset.id + '?preview=1'} alt={asset.name} loading="lazy" />
          </a>}
          <p><a href={base + '/assets/' + asset.id} download>Unduh {asset.name}</a></p>
        </article>)}
      </div>
      {canEdit && assets?.storageReady && <form onSubmit={event => {
        event.preventDefault();
        const form = event.currentTarget;
        const files = new FormData(form).getAll('file').filter((entry): entry is File => entry instanceof File && entry.size > 0);
        void submit(async () => {
          const failures: string[] = [];
          for (const file of files) {
            try {
              await request(assetUrl + '&name=' + encodeURIComponent(file.name), {
                method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file
              });
            } catch {
              failures.push(file.name);
            }
          }
          if (failures.length) throw new Error('Gagal mengunggah: ' + failures.join(', '));
        }, form);
      }}>
        <label>{photo ? 'Pilih foto JPG atau PNG' : 'Pilih dokumen PDF'} (maks. 10 MB per berkas)
          <input name="file" type="file" accept={photo ? '.jpg,.jpeg,.png' : '.pdf'} multiple required />
        </label>
        <button className="primary" disabled={busy}>{busy ? 'Mengunggah…' : 'Unggah'}</button>
      </form>}
    </>}
  </section>;
}
