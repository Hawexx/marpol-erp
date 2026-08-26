import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  Button,
  CheckBox,
  Dialog,
  Form,
  FormGroup,
  FormItem,
  Input,
  Label,
  MessageBox,
  MessageStrip,
  Text,
  TextArea,
} from '@ui5/webcomponents-react';
import { useEntity } from '../api/useEntity.js';
import { useAuth } from '../auth/AuthContext.js';
import {
  NODE_TYPE_LABEL,
  PageHeader,
  Section,
} from '../components/ui.js';
import { newId } from '../lib/id.js';
import { UiSelect } from '../components/UiSelect.js';
import type { Machine, NodeType, Workflow, WorkflowEdge, WorkflowNode } from '../api/types.js';

const NODE_W = 210;
const NODE_H = 84;

const NODE_TYPES: NodeType[] = [
  'START',
  'OPERATION',
  'MACHINE',
  'QUALITY',
  'WAIT',
  'DECISION',
  'END',
];

type Draft = Omit<Workflow, 'id'> & { id?: string };

const EMPTY_DRAFT: Draft = {
  code: '',
  name: '',
  description: '',
  version: 1,
  isActive: true,
  nodes: [],
  edges: [],
};

export default function WorkflowPage() {
  const { can } = useAuth();
  const readOnly = !can('IS_AKISI', 'edit');

  const { list, save, remove } = useEntity<Workflow>('/workflows');
  const machines = useEntity<Machine>('/machines', { activeOnly: true });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Kaydedilmemis taslak degisikligi var mi? */
  const [dirty, setDirty] = useState(false);
  /** Kaydedilmemis yeni sema taslagi acik mi? */
  const [isNew, setIsNew] = useState(false);
  /** Kaydedilmemis degisiklik varken beklemeye alinan sema secimi. */
  const [pendingSelect, setPendingSelect] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; pointerId: number; dx: number; dy: number } | null>(null);
  /** Son pointer olayi ve bekleyen cizim karesi (surukleme throttle'i). */
  const pendingRef = useRef<PointerEvent | null>(null);
  const frameRef = useRef<number | null>(null);
  /** Taslagin hangi semadan yuklendigi. Ayni id icin tekrar yukleme yapilmaz. */
  const hydratedRef = useRef<string | null>(null);

  function hydrate(source: Workflow) {
    hydratedRef.current = source.id;
    setDraft({
      ...source,
      nodes: source.nodes.map((n) => ({ ...n })),
      edges: source.edges.map((e) => ({ ...e })),
    });
    setSelectedNodeId(null);
    setConnectFrom(null);
    setError(null);
    setDirty(false);
  }

  // Ilk yuklemede ilk semayi ac. Yeni sema taslagi acikken calismamali:
  // aksi halde bos taslak hemen mevcut bir semayla degistirilir.
  useEffect(() => {
    if (isNew || selectedId || draft) return;
    if (list.data?.length) setSelectedId(list.data[0].id);
  }, [list.data, selectedId, isNew, draft]);

  /*
   * Tuvali yalnizca SECIM DEGISTIGINDE tazele.
   *
   * Bu efekt eskiden dogrudan list.data'ya bagliydi. React Query her
   * yenilemede yeni bir dizi kimligi dondurdugu icin, icerik ayni olsa bile
   * efekt tekrar calisip kaydedilmemis dugum konumlarini ve yeni baglantilari
   * siliyordu. hydratedRef sayesinde ayni sema icin ikinci kez yukleme olmaz.
   */
  useEffect(() => {
    if (isNew || !selectedId) return;
    if (hydratedRef.current === selectedId) return;
    const found = list.data?.find((w) => w.id === selectedId);
    if (found) hydrate(found);
  }, [selectedId, list.data, isNew]);

  // Kaydedilmemis degisiklik varken sekmeyi kapatma uyarisi.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  /** Kullanici kaynakli her taslak degisikligi buradan gecer. */
  const editDraft = useCallback((updater: (prev: Draft) => Draft) => {
    setDirty(true);
    setDraft((prev) => (prev ? updater(prev) : prev));
  }, []);

  const patchNode = useCallback(
    (id: string, patch: Partial<WorkflowNode>) => {
      editDraft((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      }));
    },
    [editDraft],
  );

  // --- Surukle-birak -------------------------------------------------------
  useEffect(() => {
    /*
     * Pointer olaylari kullanilir: mousemove/mouseup yalnizca fareyi dinledigi
     * icin tuval dokunmatik cihazlarda tamamen kullanilamiyordu. Pointer API'si
     * fare, dokunma ve kalemi tek arayuzde toplar.
     */
    function onMove(event: PointerEvent) {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;

      // Konum her olayda saklanir, DOM guncellemesi bir sonraki cizim
      // karesine birakilir: onceden her pointermove tum tuvali yeniden
      // render ediyordu.
      pendingRef.current = event;
      if (frameRef.current !== null) return;

      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        const latest = pendingRef.current;
        const current = dragRef.current;
        const canvas = canvasRef.current;
        if (!latest || !current || !canvas) return;

        const rect = canvas.getBoundingClientRect();
        patchNode(current.id, {
          posX: Math.max(0, latest.clientX - rect.left + canvas.scrollLeft - current.dx),
          posY: Math.max(0, latest.clientY - rect.top + canvas.scrollTop - current.dy),
        });
      });
    }

    function onUp(event: PointerEvent) {
      if (dragRef.current && event.pointerId !== dragRef.current.pointerId) return;
      dragRef.current = null;
      pendingRef.current = null;
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    // Dokunmatikte parmak ekran disina cikinca pointerup gelmeyebilir.
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [patchNode]);

  function startDrag(event: React.PointerEvent, node: WorkflowNode) {
    if (readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Dokunmatikte surukleme sayfayi kaydirmasin.
    event.preventDefault();

    const rect = canvas.getBoundingClientRect();
    dragRef.current = {
      id: node.id,
      pointerId: event.pointerId,
      dx: event.clientX - rect.left + canvas.scrollLeft - node.posX,
      dy: event.clientY - rect.top + canvas.scrollTop - node.posY,
    };
  }

  // --- Sema islemleri ------------------------------------------------------
  /**
   * Sema secimi. Kaydedilmemis degisiklik varsa once onay istenir; aksi halde
   * tuval tazelenir ve yapilan is sessizce kaybolurdu.
   */
  function requestSelect(id: string | null) {
    if (dirty) {
      setPendingSelect(id ?? '');
      return;
    }
    setIsNew(false);
    setSelectedId(id);
    if (!id) setDraft(null);
  }

  function addNode(type: NodeType) {
    if (!draft) return;
    const node: WorkflowNode = {
      id: newId(),
      type,
      label: NODE_TYPE_LABEL[type],
      description: '',
      machineId: null,
      durationMin: null,
      temperature: null,
      posX: 60 + (draft.nodes.length % 4) * 250,
      posY: 60 + Math.floor(draft.nodes.length / 4) * 150,
      sortOrder: draft.nodes.length,
    };
    editDraft((prev) => ({ ...prev, nodes: [...prev.nodes, node] }));
    setSelectedNodeId(node.id);
  }

  function removeNode(id: string) {
    if (!draft) return;
    editDraft((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((n) => n.id !== id),
      edges: prev.edges.filter((e) => e.fromNodeId !== id && e.toNodeId !== id),
    }));
    setSelectedNodeId(null);
  }

  function handleNodeClick(node: WorkflowNode) {
    if (connectFrom && connectFrom !== node.id) {
      const exists = draft?.edges.some(
        (e) => e.fromNodeId === connectFrom && e.toNodeId === node.id,
      );
      if (!exists && draft) {
        editDraft((prev) => ({
          ...prev,
          edges: [...prev.edges, { fromNodeId: connectFrom, toNodeId: node.id }],
        }));
      }
      setConnectFrom(null);
      return;
    }
    setSelectedNodeId(node.id);
  }

  /**
   * Sunucudaki validateGraph ile ayni kurallar. Burada da kontrol edilir ki
   * kullanici hatayi kaydetmeye calismadan once gorsun.
   */
  function validationError(d: Draft): string | null {
    if (!d.code.trim()) return 'Şema kodu zorunludur.';
    if (!d.name.trim()) return 'Şema adı zorunludur.';

    // Yeni şema boş kaydedilebilir (iskelet oluşturup adımları sonra eklemek).
    // Kayıtlı bir şemayı boşaltmak ise mevcut adımları ve bunlara bağlı
    // üretim kayıtlarını sileceği için engellenir.
    if (d.nodes.length === 0) {
      return d.id ? 'Kayıtlı bir şema boş bırakılamaz. En az bir adım olmalıdır.' : null;
    }

    const starts = d.nodes.filter((n) => n.type === 'START');
    if (starts.length === 0) return 'Şemada bir "Başlangıç" adımı olmalıdır.';
    if (starts.length > 1) return 'Şemada yalnızca bir "Başlangıç" adımı olabilir.';
    if (!d.nodes.some((n) => n.type === 'END')) return 'Şemada en az bir "Bitiş" adımı olmalıdır.';

    const hasIncoming = new Set(d.edges.map((e) => e.toNodeId));
    const orphan = d.nodes.find((n) => n.type !== 'START' && !hasIncoming.has(n.id));
    if (orphan) return `"${orphan.label}" adımına hiçbir bağlantı gelmiyor.`;

    return null;
  }

  function saveDraft() {
    if (!draft) return;
    const problem = validationError(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    const { id, ...data } = draft;
    save.mutate(
      {
        id,
        data: {
          ...data,
          nodes: data.nodes.map((n, index) => ({
            id: n.id,
            type: n.type,
            label: n.label,
            description: n.description,
            machineId: n.machineId || null,
            durationMin: n.durationMin,
            temperature: n.temperature,
            posX: Math.round(n.posX),
            posY: Math.round(n.posY),
            sortOrder: index,
          })),
          edges: data.edges.map((e) => ({
            fromNodeId: e.fromNodeId,
            toNodeId: e.toNodeId,
            label: e.label ?? null,
            condition: e.condition ?? null,
          })),
        },
      },
      {
        onSuccess: (result) => {
          // Sunucudan donen kayittan tazele: yeni semada id, kaydedilen
          // adimlarda sunucu tarafli alanlar buradan gelir.
          const saved = result as Workflow;
          setIsNew(false);
          setSelectedId(saved.id);
          hydrate(saved);
          setSettingsOpen(false);
        },
      },
    );
  }

  const selectedNode = draft?.nodes.find((n) => n.id === selectedNodeId) ?? null;

  return (
    <div className="mp-page mp-page--wide">
      <PageHeader
        title="İş Akışı ve Üretim Proses Şemaları"
        subtitle="Ürünün hangi adımlardan ve makine hattından geçeceğini tanımlayın"
        actions={
          <>
            {can('IS_AKISI', 'create') && (
              <Button
                icon="add"
                onClick={() => {
                  if (dirty && !window.confirm('Kaydedilmemiş değişiklikler var. Yine de yeni şema oluşturulsun mu?')) {
                    return;
                  }
                  // isNew bayragi olmadan, asagidaki otomatik secim efekti bos
                  // taslagi hemen mevcut bir semayla degistiriyordu.
                  setIsNew(true);
                  hydratedRef.current = null;
                  setSelectedId(null);
                  setDraft({ ...EMPTY_DRAFT, nodes: [], edges: [] });
                  setDirty(false);
                  setSelectedNodeId(null);
                  setConnectFrom(null);
                  setError(null);
                  setSettingsOpen(true);
                }}
              >
                Yeni Şema
              </Button>
            )}
            {!readOnly && draft && (
              <Button design="Emphasized" icon="save" onClick={saveDraft} disabled={save.isPending}>
                {dirty ? 'Kaydet *' : 'Kaydet'}
              </Button>
            )}
          </>
        }
      />

      {error && (
        <MessageStrip design="Negative" onClose={() => setError(null)}>
          {error}
        </MessageStrip>
      )}

      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: '0.75rem',
        }}
      >
        <Label showColon>Proses Şeması</Label>
        <UiSelect
          style={{ minWidth: '320px' }}
          value={isNew ? '' : (selectedId ?? '')}
          placeholder={
            isNew
              ? '(yeni şema — kaydedilmedi)'
              : (list.data ?? []).length === 0
                ? 'Kayıtlı şema yok'
                : '(seçilmedi)'
          }
          options={(list.data ?? []).map((wf) => ({
            value: wf.id,
            label: `${wf.code} - ${wf.name}`,
          }))}
          onSelect={(id) => requestSelect(id || null)}
        />

        {draft && (
          <>
            <Button design="Transparent" icon="settings" onClick={() => setSettingsOpen(true)}>
              Şema Bilgileri
            </Button>
            {can('IS_AKISI', 'delete') && draft.id && (
              <Button design="Transparent" icon="delete" onClick={() => setDeleteOpen(true)}>
                Şemayı Sil
              </Button>
            )}
          </>
        )}

        <div style={{ flex: 1 }} />

        {!readOnly && draft && (
          <>
            <Label showColon>Adım Ekle</Label>
            {NODE_TYPES.map((type) => (
              <Button key={type} design="Transparent" onClick={() => addNode(type)}>
                {NODE_TYPE_LABEL[type]}
              </Button>
            ))}
          </>
        )}
      </div>

      {connectFrom && (
        <MessageStrip
          design="Information"
          onClose={() => setConnectFrom(null)}
          style={{ marginBottom: '0.5rem' }}
        >
          Bağlantı kuruluyor: hedef adıma tıklayın. İptal için bu mesajı kapatın.
        </MessageStrip>
      )}

      {!draft ? (
        <Section>
          <Text>Görüntülemek için bir proses şeması seçin veya yeni bir şema oluşturun.</Text>
        </Section>
      ) : (
        <div className="mp-canvas-layout">
          <div className="mp-canvas" ref={canvasRef}>
            <div className="mp-canvas__inner">
              <EdgeLayer
                nodes={draft.nodes}
                edges={draft.edges}
                onRemove={
                  readOnly
                    ? undefined
                    : (edge) =>
                        editDraft((prev) => ({
                          ...prev,
                          edges: prev.edges.filter(
                            (e) =>
                              !(
                                e.fromNodeId === edge.fromNodeId && e.toNodeId === edge.toNodeId
                              ),
                          ),
                        }))
                }
              />

              {draft.nodes.map((node) => (
                <div
                  key={node.id}
                  className={`mp-node mp-node--${node.type}${
                    node.id === selectedNodeId ? ' mp-node--selected' : ''
                  }`}
                  style={{ left: node.posX, top: node.posY, width: NODE_W }}
                  onPointerDown={(e) => startDrag(e, node)}
                  onClick={() => handleNodeClick(node)}
                  /*
                   * Tuval tamamen fare/dokunma odakliydi. Adimlar artik
                   * sekme ile gezilebiliyor, Enter/Space ile secilebiliyor ve
                   * ok tuslariyla tasinabiliyor.
                   */
                  role="button"
                  tabIndex={0}
                  aria-label={`${NODE_TYPE_LABEL[node.type]}: ${node.label}`}
                  aria-pressed={node.id === selectedNodeId}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleNodeClick(node);
                      return;
                    }
                    if (readOnly) return;
                    const step = e.shiftKey ? 40 : 10;
                    const delta: Record<string, [number, number]> = {
                      ArrowLeft: [-step, 0],
                      ArrowRight: [step, 0],
                      ArrowUp: [0, -step],
                      ArrowDown: [0, step],
                    };
                    const move = delta[e.key];
                    if (!move) return;
                    e.preventDefault();
                    patchNode(node.id, {
                      posX: Math.max(0, node.posX + move[0]),
                      posY: Math.max(0, node.posY + move[1]),
                    });
                  }}
                >
                  <div className="mp-node__type">{NODE_TYPE_LABEL[node.type]}</div>
                  <div className="mp-node__label">{node.label}</div>
                  <div className="mp-node__meta">
                    {node.machine?.name ??
                      machines.list.data?.find((m) => m.id === node.machineId)?.name ??
                      ''}
                    {node.durationMin ? ` · ${node.durationMin} dk` : ''}
                    {node.temperature ? ` · ${node.temperature}°C` : ''}
                  </div>
                  {!readOnly && node.type !== 'END' && (
                    <div
                      className="mp-node__port"
                      title="Buradan bağlantı başlat"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConnectFrom(node.id);
                      }}
                    />
                  )}
                </div>
              ))}

              {draft.nodes.length === 0 && (
                <div style={{ padding: '2rem', color: 'var(--sapContent_LabelColor)' }}>
                  Şema boş. Yukarıdaki "Adım Ekle" butonlarıyla üretim adımlarını ekleyin,
                  ardından adımların sağındaki mavi noktadan hedef adıma tıklayarak akışı
                  bağlayın.
                </div>
              )}
            </div>
          </div>

          <Section className="mp-node-panel" title="Adım Özellikleri">
            {!selectedNode ? (
              <Text>Düzenlemek için tuvalden bir adım seçin.</Text>
            ) : (
              <div className="mp-stack">
                <div>
                  <Label showColon>Adım Tipi</Label>
                  <UiSelect
                    style={{ width: '100%' }}
                    disabled={readOnly}
                    value={selectedNode.type}
                    options={NODE_TYPES.map((type) => ({
                      value: type,
                      label: NODE_TYPE_LABEL[type],
                    }))}
                    onSelect={(type) => patchNode(selectedNode.id, { type: type as NodeType })}
                  />
                </div>

                <div>
                  <Label showColon required>
                    Adım Adı
                  </Label>
                  <Input
                    style={{ width: '100%' }}
                    readonly={readOnly}
                    value={selectedNode.label}
                    onInput={(e) => patchNode(selectedNode.id, { label: e.target.value })}
                  />
                </div>

                <div>
                  <Label showColon>Makine / Hat</Label>
                  <UiSelect
                    style={{ width: '100%' }}
                    disabled={readOnly}
                    value={selectedNode.machineId ?? ''}
                    placeholder="(Seçilmedi)"
                    options={(machines.list.data ?? []).map((m) => ({
                      value: m.id,
                      label: `${m.code} - ${m.name}`,
                    }))}
                    onSelect={(machineId) =>
                      patchNode(selectedNode.id, { machineId: machineId || null })
                    }
                  />
                </div>

                <div>
                  <Label showColon>Tahmini Süre (dk)</Label>
                  <Input
                    type="Number"
                    style={{ width: '100%' }}
                    readonly={readOnly}
                    value={selectedNode.durationMin?.toString() ?? ''}
                    onInput={(e) =>
                      patchNode(selectedNode.id, {
                        durationMin: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>

                <div>
                  <Label showColon>Sıcaklık (°C)</Label>
                  <Input
                    type="Number"
                    style={{ width: '100%' }}
                    readonly={readOnly}
                    value={selectedNode.temperature?.toString() ?? ''}
                    onInput={(e) =>
                      patchNode(selectedNode.id, {
                        temperature: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>

                <div>
                  <Label showColon>Açıklama / Talimat</Label>
                  <TextArea
                    rows={3}
                    style={{ width: '100%' }}
                    readonly={readOnly}
                    value={selectedNode.description ?? ''}
                    onInput={(e) => patchNode(selectedNode.id, { description: e.target.value })}
                  />
                </div>

                {!readOnly && (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Button
                      design="Transparent"
                      icon="chain-link"
                      onClick={() => setConnectFrom(selectedNode.id)}
                    >
                      Bağla
                    </Button>
                    <Button
                      design="Negative"
                      icon="delete"
                      onClick={() => removeNode(selectedNode.id)}
                    >
                      Adımı Sil
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Section>
        </div>
      )}

      {settingsOpen && draft && (
        <Dialog
          open
          headerText={draft.id ? 'Şema Bilgileri' : 'Yeni Proses Şeması'}
          onClose={() => setSettingsOpen(false)}
          footer={
            <Bar
              design="Footer"
              endContent={
                <>
                  <Button design="Transparent" onClick={() => setSettingsOpen(false)}>
                    Kapat
                  </Button>
                  <Button
                    design="Emphasized"
                    disabled={!draft.code || !draft.name}
                    onClick={() => setSettingsOpen(false)}
                  >
                    Tamam
                  </Button>
                </>
              }
            />
          }
        >
          <div style={{ minWidth: 'min(520px, 80vw)', padding: '0.5rem 0' }}>
            <Form layout="S1 M1 L1 XL1">
              <FormGroup>
                <FormItem labelContent={<Label required>Şema Kodu</Label>}>
                  <Input
                    value={draft.code}
                    readonly={readOnly}
                    placeholder="PS-001"
                    onInput={(e) => editDraft((prev) => ({ ...prev, code: e.target.value }))}
                  />
                </FormItem>
                <FormItem labelContent={<Label required>Şema Adı</Label>}>
                  <Input
                    value={draft.name}
                    readonly={readOnly}
                    onInput={(e) => editDraft((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </FormItem>
                <FormItem labelContent={<Label>Versiyon</Label>}>
                  <Input
                    type="Number"
                    value={String(draft.version)}
                    readonly={readOnly}
                    onInput={(e) => editDraft((prev) => ({ ...prev, version: Number(e.target.value) || 1 }))}
                  />
                </FormItem>
                <FormItem labelContent={<Label>Açıklama</Label>}>
                  <TextArea
                    rows={3}
                    value={draft.description ?? ''}
                    readonly={readOnly}
                    onInput={(e) => editDraft((prev) => ({ ...prev, description: e.target.value }))}
                  />
                </FormItem>
                <FormItem labelContent={<Label>Durum</Label>}>
                  <CheckBox
                    text="Aktif"
                    checked={draft.isActive}
                    disabled={readOnly}
                    onChange={(e) => editDraft((prev) => ({ ...prev, isActive: e.target.checked }))}
                  />
                </FormItem>
              </FormGroup>
            </Form>
            <MessageStrip design="Information" hideCloseButton style={{ marginTop: '0.75rem' }}>
              Şema en az bir "Başlangıç" ve bir "Bitiş" adımı içermeli, tüm adımlar akışa
              bağlı olmalıdır.
            </MessageStrip>
          </div>
        </Dialog>
      )}

      {pendingSelect !== null && (
        <MessageBox
          open
          type="Warning"
          titleText="Kaydedilmemiş Değişiklikler"
          actions={['Değişiklikleri At', 'Vazgeç']}
          onClose={(action) => {
            if (action === 'Değişiklikleri At') {
              const target = pendingSelect || null;
              setDirty(false);
              setIsNew(false);
              hydratedRef.current = null;
              setSelectedId(target);
              if (!target) setDraft(null);
            }
            setPendingSelect(null);
          }}
        >
          Bu şemada kaydedilmemiş değişiklikler var. Başka bir şemaya geçerseniz bu
          değişiklikler kaybolacak.
        </MessageBox>
      )}

      {deleteOpen && draft?.id && (
        <MessageBox
          open
          type="Warning"
          titleText="Proses Şeması Sil"
          actions={['Sil', 'Vazgeç']}
          onClose={(action) => {
            if (action === 'Sil') {
              remove.mutate(draft.id!, {
                onSuccess: () => {
                  hydratedRef.current = null;
                  setIsNew(false);
                  setDirty(false);
                  setSelectedId(null);
                  setDraft(null);
                },
              });
            }
            setDeleteOpen(false);
          }}
        >
          <strong>{draft.code}</strong> - {draft.name} şemasını silmek istediğinize emin misiniz?
        </MessageBox>
      )}
    </div>
  );
}

/** Adimlar arasindaki baglantilari cizen SVG katmani. */
function EdgeLayer({
  nodes,
  edges,
  onRemove,
}: {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  onRemove?: (edge: WorkflowEdge) => void;
}) {
  // Surukleme sirasinda bu bilesen her karede yeniden ciziliyor; harita
  // yalnizca dugumler degistiginde kurulur.
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  return (
    <svg
      width="2400"
      height="1400"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      <defs>
        <marker
          id="mp-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#6a6d70" />
        </marker>
      </defs>

      {edges.map((edge, index) => {
        const from = byId.get(edge.fromNodeId);
        const to = byId.get(edge.toNodeId);
        if (!from || !to) return null;

        const x1 = from.posX + NODE_W;
        const y1 = from.posY + NODE_H / 2;
        const x2 = to.posX;
        const y2 = to.posY + NODE_H / 2;
        const cx = Math.max(60, Math.abs(x2 - x1) / 2);

        return (
          <g key={`${edge.fromNodeId}-${edge.toNodeId}-${index}`}>
            <path
              d={`M ${x1} ${y1} C ${x1 + cx} ${y1}, ${x2 - cx} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke="#6a6d70"
              strokeWidth={2}
              markerEnd="url(#mp-arrow)"
            />
            {onRemove && (
              <circle
                cx={(x1 + x2) / 2}
                cy={(y1 + y2) / 2}
                r={8}
                fill="#fff"
                stroke="#bb0000"
                strokeWidth={1.5}
                style={{ pointerEvents: 'all', cursor: 'pointer' }}
                onClick={() => onRemove(edge)}
              >
                <title>Bağlantıyı kaldır</title>
              </circle>
            )}
            {edge.label && (
              <text
                x={(x1 + x2) / 2}
                y={(y1 + y2) / 2 - 12}
                textAnchor="middle"
                fontSize={11}
                fill="#6a6d70"
              >
                {edge.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
