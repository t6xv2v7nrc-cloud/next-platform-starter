import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { useData } from '../lib/data';
import { needsCv, STATUSES, type Application, type Status } from '../lib/types';
import type { Row } from '../lib/analytics';
import { CvBadge, ErrorText, MoveDialog, PageHeader, RiskBadge } from '../components/ui';

export default function Board() {
  const { rows, move } = useData();
  const [dragging, setDragging] = useState<Row | null>(null);
  const [dialog, setDialog] = useState<{ app: Application; to?: Status } | null>(null);
  const [error, setError] = useState('');
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const byStatus = useMemo(() => {
    const m = new Map<Status, Row[]>(STATUSES.map((s) => [s, []]));
    for (const r of rows) m.get(r.app.status)!.push(r);
    for (const list of m.values()) list.sort((a, b) => a.daysInStage - b.daysInStage);
    return m;
  }, [rows]);

  async function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const row = rows.find((r) => r.app.id === e.active.id);
    const to = e.over?.id as Status | undefined;
    if (!row || !to || to === row.app.status) return;
    // A CV version is required from Applied onwards, so ask for it before saving.
    if (needsCv(to) && !row.app.cv_version_id) return setDialog({ app: row.app, to });
    try {
      setError('');
      await move(row.app, to);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <PageHeader title="Pipeline board">
        <Link className="btn btn-sm btn-primary" to="/add">Quick add</Link>
      </PageHeader>
      <p className="mb-3 text-xs text-muted">Drag a card to move it (press and hold on a phone), or use Move. Every move writes a status event.</p>
      <ErrorText>{error}</ErrorText>
      <DndContext sensors={sensors} onDragStart={(e) => setDragging(rows.find((r) => r.app.id === e.active.id) ?? null)} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 lg:-mx-6 lg:px-6">
          {STATUSES.map((s) => (
            <Column key={s} status={s} rows={byStatus.get(s)!} onMove={(app) => setDialog({ app })} />
          ))}
        </div>
        <DragOverlay>{dragging && <CardBody row={dragging} overlay />}</DragOverlay>
      </DndContext>
      {dialog && <MoveDialog app={dialog.app} to={dialog.to} onClose={() => setDialog(null)} />}
    </>
  );
}

function Column({ status, rows, onMove }: { status: Status; rows: Row[]; onMove: (a: Application) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section ref={setNodeRef} aria-label={status}
      className={`flex w-64 shrink-0 snap-start flex-col rounded-xl border p-2 ${isOver ? 'border-accent bg-accent/10' : 'border-line bg-raised/60'}`}>
      <h2 className="flex items-center justify-between px-1 pb-2 text-sm font-semibold">
        {status} <span className="text-xs font-normal text-muted">{rows.length}</span>
      </h2>
      <div className="flex min-h-24 flex-col gap-2">
        {rows.map((r) => <Card key={r.app.id} row={r} onMove={onMove} />)}
      </div>
    </section>
  );
}

function Card({ row, onMove }: { row: Row; onMove: (a: Application) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: row.app.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={`touch-manipulation select-none ${isDragging ? 'opacity-30' : ''}`}>
      <CardBody row={row} onMove={onMove} />
    </div>
  );
}

function CardBody({ row, onMove, overlay }: { row: Row; onMove?: (a: Application) => void; overlay?: boolean }) {
  const a = row.app;
  return (
    <article className={`card cursor-grab p-2.5 ${overlay ? 'rotate-2 shadow-lg' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <Link to={`/applications/${a.id}`} className="min-w-0 hover:underline" draggable={false}>
          <span className="block truncate text-sm font-semibold">{a.company}</span>
          <span className="block truncate text-xs text-muted">{a.role_title}</span>
        </Link>
        {onMove && (
          <button className="btn btn-sm shrink-0" onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()} onClick={() => onMove(a)}>Move</button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className="chip">{row.daysInStage === 0 ? 'Today' : `${row.daysInStage} d in stage`}</span>
        <CvBadge id={a.cv_version_id} />
        <RiskBadge risk={a.conflict_risk} />
      </div>
    </article>
  );
}
