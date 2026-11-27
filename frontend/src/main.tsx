import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { ProjectResources, type ResourcePage } from './ProjectResources';
import { TaskViews } from './TaskViews';
import { ProjectTasks } from './ProjectTasks';

type User = { name: string; theme: 'clean' | 'dark'; isAdmin: boolean; mustChangePassword: boolean };
type Project = {
  id: number; name: string; category: string; description: string; status: string;
  progress: number; deadline: string | null; updatedAt: string; favorite: boolean;
};
type Portfolio = { projects: Project[]; total: number; active: number; completed: number };
const navigation = [
  { title: 'RUANG KERJA', pages: ['Dashboard', 'Semua Proyek', 'Proyek Favorit', 'Tugas Saya', 'Kalender'] },
  { title: 'SUMBER DAYA', pages: ['Dokumen', 'Galeri Foto', 'Keuangan', 'Pusat Laporan'] },
  { title: 'ADMINISTRASI', pages: ['Pengaturan'] }
] as const;
type Page = typeof navigation[number]['pages'][number];
function isResourcePage(page: Page): page is ResourcePage {
  return page === 'Dokumen' || page === 'Galeri Foto' || page === 'Keuangan' || page === 'Pusat Laporan';
}
const statuses: Record<string, string> = {
  active: 'Berjalan', completed: 'Selesai', on_hold: 'Ditunda', archived: 'Diarsipkan'
};
const date = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'Asia/Jakarta' });
const empty: Portfolio = { projects: [], total: 0, active: 0, completed: 0 };

async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch('/api/v1' + path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (response.status === 204) return undefined as T;
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? 'Permintaan gagal.');
  return result.data;
}
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Terjadi kesalahan.';

function App() {
  const [user, setUser] = useState<User | null>();
  const [portfolio, setPortfolio] = useState(empty);
  const [page, setPage] = useState<Page>('Dashboard');
  const [selected, setSelected] = useState<number>();
  const [list, setList] = useState(false);
  const [query, setQuery] = useState('');
  const [drawer, setDrawer] = useState(false);
  const [editor, setEditor] = useState<Project | null>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const menu = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const theme = user?.theme ?? 'clean';

  async function refresh() {
    setLoading(true);
    try {
      const first = await api<Portfolio>('/projects?limit=100');
      const projects = [...first.projects];
      for (let offset = 100; offset < first.total; offset += 100) {
        const next = await api<Portfolio>('/projects?limit=100&offset=' + offset);
        projects.push(...next.projects);
      }
      setPortfolio({ ...first, projects });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { api<User>('/auth/me').then(setUser).catch(() => setUser(null)); }, []);
  const canLoad = Boolean(user && !user.mustChangePassword);
  useEffect(() => {
    if (canLoad) refresh().catch(value => setError(errorMessage(value)));
  }, [canLoad]);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => {
    if (editor !== undefined && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [editor]);
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape' && drawer) {
        setDrawer(false);
        menu.current?.focus();
      }
      if (canLoad && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPage('Semua Proyek');
        setSelected(undefined);
        requestAnimationFrame(() => search.current?.focus());
      }
    }
    if (drawer) close.current?.focus();
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [drawer, canLoad]);

  async function action(operation: () => Promise<void>) {
    setError('');
    setBusy(true);
    try { await operation(); }
    catch (value) { setError(errorMessage(value)); }
    finally { setBusy(false); }
  }

  function navigate(target: Page) {
    setPage(target);
    setSelected(undefined);
    setQuery('');
    setDrawer(false);
  }

  async function toggleTheme() {
    await action(async () => setUser(await api<User>('/auth/preferences', 'PATCH', {
      theme: theme === 'dark' ? 'clean' : 'dark'
    })));
  }

  async function logout() {
    await action(async () => {
      await api('/auth/logout', 'POST');
      setUser(null);
      setPortfolio(empty);
      navigate('Dashboard');
    });
  }

  const isLogin = user === null;
  if (user === undefined) return <div className="login card" role="status">Memuat ProjectCore…</div>;
  if (isLogin || user.mustChangePassword) return (
    <section className="login card">
      <h1>◈ ProjectCore</h1>
      <p className="muted">{isLogin ? 'Ruang kerja proyek' : 'Ganti password awal untuk melanjutkan.'}</p>
      {error && <p className="notice" role="alert">{error}</p>}
      <form onSubmit={event => {
        event.preventDefault();
        const fields = Object.fromEntries(new FormData(event.currentTarget));
        void action(async () => {
          if (isLogin) setUser(await api<User>('/auth/login', 'POST', fields));
          else {
            await api('/auth/password', 'POST', fields);
            setUser(null);
          }
        });
      }}>
        {isLogin ? <>
          <label>Username<input name="username" autoComplete="username" required /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        </> : <>
          <label>Password saat ini<input name="current" type="password" autoComplete="current-password" required /></label>
          <label>Password baru<input name="password" type="password" autoComplete="new-password" minLength={14} required /></label>
        </>}
        <button className="primary" disabled={busy}>{isLogin ? 'Masuk' : 'Simpan password'}</button>
        {!isLogin && <button type="button" onClick={logout} disabled={busy}>Keluar</button>}
      </form>
    </section>
  );

  const current = portfolio.projects.find(project => project.id === selected);
  const visible = portfolio.projects.filter(project =>
    (page !== 'Proyek Favorit' || project.favorite) &&
    (project.name + ' ' + project.category).toLocaleLowerCase('id').includes(query.toLocaleLowerCase('id'))
  );

  return <>
    <div className="mobile-header">
      <button ref={menu} aria-label="Buka menu" aria-controls="sidebar" aria-expanded={drawer} onClick={() => setDrawer(true)}>☰</button>
      <strong>ProjectCore</strong>
      <button className="mobile-theme" onClick={toggleTheme} aria-label="Ganti tema">☀ / ☾</button>
    </div>
    {drawer && <button className="overlay" tabIndex={-1} aria-label="Tutup menu" onClick={() => { setDrawer(false); menu.current?.focus(); }} />}
    <aside id="sidebar" className={drawer ? 'drawer-open' : ''}>
      <button className="drawer-close" ref={close} aria-label="Tutup menu" onClick={() => { setDrawer(false); menu.current?.focus(); }}>×</button>
      <h2>◈ ProjectCore</h2>
      <nav aria-label="Navigasi utama">
        {navigation.map(group => (
          <section key={group.title} aria-label={group.title}>
            <small>{group.title}</small>
            {group.pages.filter(value => value !== 'Keuangan' || user.isAdmin).map(value => (
              <button
                key={value}
                className={page === value && !current ? 'active' : ''}
                aria-current={page === value && !current ? 'page' : undefined}
                onClick={() => navigate(value)}
              >{value}</button>
            ))}
          </section>
        ))}
      </nav>
      <button onClick={toggleTheme}>☀ / ☾ Tema</button>
      <div className="profile"><small>{user.name}</small><button onClick={logout}>Keluar</button></div>
    </aside>
    <main>
      {error && <p className="notice" role="alert">{error}</p>}
      {current ? <>
        <button onClick={() => setSelected(undefined)}>← {page === 'Dashboard' ? 'Dashboard' : page}</button>
        <header className="detail-heading">
          <div><span className="pill">{current.category}</span><h1>{current.name}</h1></div>
          {user.isAdmin && <button onClick={() => setEditor(current)}>Ubah proyek</button>}
        </header>
        <div className="cover detail-cover"><small>PROJECTCORE / {current.category}</small><strong>{current.name}</strong></div>
        <section className="card">
          <h2>Ringkasan</h2>
          <p>{current.description || 'Belum ada deskripsi proyek.'}</p>
          <p className="muted">{statuses[current.status]} · Target {current.deadline ? date.format(new Date(current.deadline)) : 'belum ditentukan'}</p>
        </section>
        <ProjectTasks key={current.id} projectId={current.id} canEdit={user.isAdmin} />
      </> : page === 'Tugas Saya' || page === 'Kalender' ?
        <TaskViews key={page} calendar={page === 'Kalender'} openProject={id => { setPage('Semua Proyek'); setSelected(id); }} />
      : isResourcePage(page) ? <ProjectResources key={page} page={page} projects={portfolio.projects} canEdit={user.isAdmin} loading={loading} />
      : page === 'Pengaturan' ? <>
        <h1>Pengaturan</h1><div className="card settings"><h2>Tampilan</h2>
          <button onClick={toggleTheme}>Gunakan mode {theme === 'dark' ? 'terang' : 'gelap'}</button>
        </div>
      </> : <>
        <header>
          <div><small>RUANG KERJA / PROYEK</small><h1>{page === 'Dashboard' ? 'Ringkasan Proyek' : page}</h1></div>
          {user.isAdmin && <button className="primary" onClick={() => setEditor(null)}>+ Proyek baru</button>}
        </header>
        {page === 'Dashboard' && <div className="grid stats">
          {([['Proyek', portfolio.total], ['Berjalan', portfolio.active], ['Selesai', portfolio.completed]] as const).map(([label, value]) =>
            <div className="card" key={label}><small>{label}</small><div className="stat">{loading ? '…' : value}</div></div>)}
        </div>}
        <div className="row portfolio-heading">
          <h2>Portofolio Proyek</h2>
          <div className="row controls">
            <input ref={search} aria-label="Cari proyek" placeholder="Cari proyek atau kategori" value={query} onChange={event => setQuery(event.target.value)} />
            <button onClick={() => setList(!list)}>{list ? 'Grid' : 'Daftar'}</button>
          </div>
        </div>
        <div className={'grid ' + (list ? 'list' : '')}>
          {visible.map(project => <article className="card project" key={project.id}>
            <button className="favorite" aria-label="Favorit" aria-pressed={project.favorite} disabled={busy} onClick={() => action(async () => {
              await api('/projects/' + project.id + '/favorite', 'PUT', { favorite: !project.favorite });
              await refresh();
            })}>{project.favorite ? '★' : '☆'}</button>
            <button className="project-open" onClick={() => setSelected(project.id)}>
              <span className="cover"><small>PROJECTCORE / {project.category}</small><strong>{project.name}</strong></span>
              <span className="pill">{project.category}</span>
              <span className="project-title">{project.name}</span>
              <span className="row"><small>{statuses[project.status]}</small><b>{project.progress}%</b></span>
              <progress value={project.progress} max={100} aria-label="Progress proyek" />
              <small>Target {project.deadline ? date.format(new Date(project.deadline)) : 'belum ditentukan'}</small>
            </button>
          </article>)}
          {visible.length === 0 && <div className="card muted" role="status">{loading ? 'Memuat proyek…' : 'Belum ada proyek.'}</div>}
        </div>
      </>}
    </main>

    {editor !== undefined && <dialog ref={dialog} onClose={() => setEditor(undefined)}>
      <form onSubmit={event => {
        event.preventDefault();
        const fields = Object.fromEntries(new FormData(event.currentTarget));
        void action(async () => {
          await api(editor ? '/projects/' + editor.id : '/projects', editor ? 'PATCH' : 'POST', {
            ...fields, deadline: fields.deadline || null
          });
          setEditor(undefined);
          await refresh();
        });
      }}>
        <h2>{editor ? 'Ubah proyek' : 'Proyek baru'}</h2>
        {error && <p className="notice" role="alert">{error}</p>}
        <label>Nama<input name="name" autoFocus required maxLength={180} defaultValue={editor?.name} /></label>
        <label>Kategori<input name="category" required maxLength={120} defaultValue={editor?.category} /></label>
        <label>Deskripsi<textarea name="description" maxLength={10000} defaultValue={editor?.description} /></label>
        <label>Status<select name="status" defaultValue={editor?.status ?? 'active'}>
          {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>Target selesai<input name="deadline" type="date" defaultValue={editor?.deadline?.slice(0, 10)} /></label>
        <div className="row">
          <button type="button" onClick={() => setEditor(undefined)}>Batal</button>
          <button className="primary" disabled={busy}>Simpan</button>
        </div>
      </form>
    </dialog>}
  </>;
}
createRoot(document.getElementById('root')!).render(<App />);
