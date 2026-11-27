import { useEffect, useState } from 'react';

export type Task = {
  id: number;
  title: string;
  description: string;
  pic: string;
  deadline: string | null;
  done: boolean;
  assigneeId: number | null;
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? 'Gagal memuat tugas.');
  return result.data;
}

export function ProjectTasks({ projectId, canEdit }: { projectId: number; canEdit: boolean }) {
  const path = '/api/v1/projects/' + projectId + '/tasks';
  const [tasks, setTasks] = useState<Task[]>();
  const [editing, setEditing] = useState<Task | null>();
  const [busy, setBusy] = useState(false);
  const [board, setBoard] = useState(false);
  const [people, setPeople] = useState<{ id: number; name: string; username: string }[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    request<Task[]>(path).then(rows => {
      if (active) setTasks(rows);
    }).catch((err: Error) => {
      if (active) setError(err.message);
    });
    return () => { active = false; };
  }, [path]);
  useEffect(() => {
    if (!canEdit) return;
    let active = true;
    request<typeof people>('/api/v1/projects/' + projectId + '/task-assignees')
      .then(rows => { if (active) setPeople(rows); })
      .catch((err: Error) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [canEdit, projectId]);

  async function save(id: number | undefined, data: object) {
    setBusy(true);
    setError('');
    try {
      const task = await request<Task>(id ? path + '/' + id : path, {
        method: id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      setTasks(previous => id
        ? previous?.map(item => item.id === id ? task : item)
        : [...(previous ?? []), task]);
      setEditing(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan tugas.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="card settings">
    <div className="row">
      <h2>Daftar Tugas</h2>
      <button onClick={() => setBoard(!board)}>{board ? 'Tampilan daftar' : 'Tampilan Kanban'}</button>
      {canEdit && <button className="primary" disabled={busy || !tasks} onClick={() => setEditing(null)}>+ Tambah tugas</button>}
    </div>
    {error && <p role="alert" className="notice">{error}</p>}
    {!tasks && !error && <p role="status">Memuat tugas…</p>}
    {tasks?.length === 0 && <p className="muted">Belum ada tugas.</p>}
    <div className={board ? "grid" : undefined}>{(board ? [false, true] : [null]).map(done => <section key={String(done)}>
    {done !== null && <h3>{done ? "Selesai" : "Belum selesai"}</h3>}
    {tasks?.filter(task => done === null || task.done === done).map(task => <div className="row" key={task.id}>
      <div>
        <p>{task.title}</p>
        {task.description && <p>{task.description}</p>}
        <small>{task.pic || 'Belum ada PIC'} · {task.deadline?.slice(0, 10) || 'Tanpa tenggat'}</small>
      </div>
      <div className="row">
        <label><input type="checkbox" checked={task.done} disabled={!canEdit || busy || editing !== undefined}
          aria-label={'Selesai: ' + task.title} onChange={event => void save(task.id, { done: event.target.checked })} /> Selesai</label>
        {canEdit && <button disabled={busy} onClick={() => setEditing(task)}>Edit</button>}
      </div>
    </div>)}
    </section>)}</div>
    {editing !== undefined && <form key={editing?.id ?? 'new'} onSubmit={event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      void save(editing?.id, { ...data, deadline: data.deadline || null, assigneeId: data.assigneeId ? Number(data.assigneeId) : null, done: editing?.done ?? false });
    }}>
      <h3>{editing ? 'Edit tugas' : 'Tugas baru'}</h3>
      <label>Pekerjaan<input name="title" required maxLength={180} defaultValue={editing?.title} /></label>
      <label>Deskripsi<textarea name="description" maxLength={10000} defaultValue={editing?.description} /></label>
      <label>PIC<input name="pic" maxLength={160} defaultValue={editing?.pic} /></label>
      <label>Ditugaskan kepada<select name="assigneeId" defaultValue={editing?.assigneeId ?? ''}>
        <option value="">Belum ditugaskan</option>
        {people.map(person => <option key={person.id} value={person.id}>{person.name} ({person.username})</option>)}
      </select></label>
      <label>Deadline<input name="deadline" type="date" defaultValue={editing?.deadline?.slice(0, 10)} /></label>
      <div className="row">
        <button type="button" disabled={busy} onClick={() => setEditing(undefined)}>Batal</button>
        <button className="primary" disabled={busy}>Simpan tugas</button>
      </div>
    </form>}
  </section>;
}
