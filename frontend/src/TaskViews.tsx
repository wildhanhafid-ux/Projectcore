import { useEffect, useState } from 'react';
import type { Task } from './ProjectTasks';

type OwnedTask = Task & { project: { id: number; name: string } };
type Calendar = { tasks: OwnedTask[]; projects: { id: number; name: string; deadline: string }[] };
const jakartaDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' });
const displayDay = new Intl.DateTimeFormat('id-ID', { dateStyle: 'full', timeZone: 'UTC' });

export function TaskViews({ calendar, openProject }: { calendar: boolean; openProject: (id: number) => void }) {
  const [month, setMonth] = useState(() => jakartaDay.format(new Date()).slice(0, 7));
  const [data, setData] = useState<Calendar>();
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setData(undefined);
    setError('');
    const query = calendar ? 'view=calendar&month=' + encodeURIComponent(month) : 'view=mine';
    fetch('/api/v1/tasks?' + query, { signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? 'Data gagal dimuat.');
      if (!controller.signal.aborted) setData(calendar ? result.data : { tasks: result.data, projects: [] });
    }).catch((err: Error) => {
      if (!controller.signal.aborted) setError(err.message);
    });
    return () => controller.abort();
  }, [calendar, month]);

  const entries = [
    ...(data?.tasks ?? []).map(task => ({
      key: 'task-' + task.id, title: task.title, project: task.project,
      deadline: task.deadline, caption: task.done ? 'Selesai' : 'Belum selesai'
    })),
    ...(data?.projects ?? []).map(project => ({
      key: 'project-' + project.id, title: 'Deadline proyek', project,
      deadline: project.deadline, caption: 'Proyek'
    }))
  ];
  if (calendar) entries.sort((a, b) => (a.deadline ?? '').localeCompare(b.deadline ?? ''));
  return <>
    <header><h1>{calendar ? 'Kalender' : 'Tugas Saya'}</h1>
      {calendar && <label>Bulan<input type="month" value={month} onChange={event => {
        if (event.target.value) setMonth(event.target.value);
      }} /></label>}
    </header>
    <div className="card settings">
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Memuat…</p>}
      {data && !entries.length && <p>{calendar ? 'Belum ada agenda bulan ini.' : 'Belum ada tugas yang ditugaskan kepada Anda.'}</p>}
      {entries.map(entry => <article className="row" key={entry.key}>
        <div>
          <p><strong>{entry.title}</strong> · {entry.project.name}</p>
          <small>{entry.deadline ? displayDay.format(new Date(entry.deadline)) : 'Tanpa tenggat'} · {entry.caption}</small>
        </div>
        <button onClick={() => openProject(entry.project.id)}>Buka proyek</button>
      </article>)}
    </div>
  </>;
}
