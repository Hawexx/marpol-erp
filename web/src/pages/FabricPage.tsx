import { useMemo, useState } from 'react';
import {
  AnalyticalTable,
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
  ObjectStatus,
  Tab,
  TabContainer,
  TextArea,
  Title,
} from '@ui5/webcomponents-react';
import { useEntity } from '../api/useEntity.js';
import { UiSelect } from '../components/UiSelect.js';
import { useAuth } from '../auth/AuthContext.js';
import { PageHeader, formatNumber } from '../components/ui.js';
import { DataToolbar } from '../components/DataToolbar.js';
import { columns as tableColumns } from '../components/table.js';
import type { Chemical, Fabric, FabricChemical } from '../api/types.js';

type FabricForm = Omit<Fabric, 'id'> & { id?: string };
type ChemicalForm = Omit<Chemical, 'id'> & { id?: string };

const EMPTY_FABRIC: FabricForm = {
  code: '',
  name: '',
  type: '',
  composition: '',
  gramaj: null,
  width: null,
  thickness: null,
  color: '',
  supplier: '',
  notes: '',
  isActive: true,
  chemicals: [],
};

const EMPTY_CHEMICAL: ChemicalForm = {
  code: '',
  name: '',
  type: '',
  unit: 'kg',
  density: null,
  supplier: '',
  hazardNote: '',
  notes: '',
  isActive: true,
};

export default function FabricPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<'fabrics' | 'chemicals'>('fabrics');

  return (
    <div className="mp-page">
      <PageHeader
        title="Kumaş Çeşitleri"
        subtitle="Kumaş tanım kartları ve kumaşa emdirilecek kimyasallar"
      />

      <TabContainer
        collapsed
        onTabSelect={(e) => setTab(e.detail.tab.getAttribute('data-key') as 'fabrics' | 'chemicals')}
      >
        <Tab text="Kumaşlar" icon="grid" data-key="fabrics" selected={tab === 'fabrics'} />
        <Tab text="Kimyasallar" icon="lab" data-key="chemicals" selected={tab === 'chemicals'} />
      </TabContainer>

      {tab === 'fabrics' ? <FabricsTab canEdit={can} /> : <ChemicalsTab canEdit={can} />}
    </div>
  );
}

type CanFn = ReturnType<typeof useAuth>['can'];

// ---------------------------------------------------------------------------
// KUMAS SEKMESI
// ---------------------------------------------------------------------------

function FabricsTab({ canEdit }: { canEdit: CanFn }) {
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<FabricForm | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Fabric | null>(null);

  const { list, save, remove } = useEntity<Fabric>('/fabrics', { search });
  const chemicals = useEntity<Chemical>('/chemicals', { activeOnly: true });

  const columns = useMemo(
    () => tableColumns<Fabric>([
      { Header: 'Kumaş Kodu', accessor: 'code', width: 130 },
      { Header: 'Tanım', accessor: 'name', minWidth: 220 },
      { Header: 'Tip', accessor: 'type', width: 130 },
      {
        Header: 'Gramaj (g/m²)',
        accessor: 'gramaj',
        width: 140,
        hAlign: 'End' as const,
        Cell: ({ value }: { value?: number }) => formatNumber(value),
      },
      {
        Header: 'En (mm)',
        accessor: 'width',
        width: 110,
        hAlign: 'End' as const,
        Cell: ({ value }: { value?: number }) => formatNumber(value),
      },
      {
        Header: 'Kalınlık (mm)',
        accessor: 'thickness',
        width: 130,
        hAlign: 'End' as const,
        Cell: ({ value }: { value?: number }) => formatNumber(value, 1),
      },
      { Header: 'Renk', accessor: 'color', width: 110 },
      {
        Header: 'Emdirilen Kimyasal',
        id: 'chemCount',
        width: 300,
        disableFilters: true,
        Cell: ({ row }: { row: { original: Fabric } }) =>
          row.original.chemicals.length
            ? row.original.chemicals
                .map((c) => `${c.chemical?.code ?? ''} %${c.ratio}`)
                .join(', ')
            : '-',
      },
      {
        Header: 'Durum',
        accessor: 'isActive',
        width: 100,
        Cell: ({ value }: { value: boolean }) => (
          <ObjectStatus state={value ? 'Positive' : 'None'}>
            {value ? 'Aktif' : 'Pasif'}
          </ObjectStatus>
        ),
      },
      {
        Header: 'İşlem',
        id: 'actions',
        width: 110,
        disableFilters: true,
        disableSortBy: true,
        Cell: ({ row }: { row: { original: Fabric } }) => (
          <div className="mp-inline-actions">
            {canEdit('KUMAS', 'edit') && (
              <Button
                design="Transparent"
                icon="edit"
                tooltip="Düzenle"
                onClick={() =>
                  setForm({
                    ...row.original,
                    chemicals: row.original.chemicals.map((c) => ({
                      chemicalId: c.chemicalId,
                      ratio: c.ratio,
                      notes: c.notes,
                    })),
                  })
                }
              />
            )}
            {canEdit('KUMAS', 'delete') && (
              <Button
                design="Transparent"
                icon="delete"
                tooltip="Sil"
                onClick={() => setDeleteTarget(row.original)}
              />
            )}
          </div>
        ),
      },
    ]),
    [canEdit],
  );

  const update = (patch: Partial<FabricForm>) =>
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));

  const updateChemical = (index: number, patch: Partial<FabricChemical>) =>
    setForm((prev) =>
      prev
        ? {
            ...prev,
            chemicals: prev.chemicals.map((c, i) => (i === index ? { ...c, ...patch } : c)),
          }
        : prev,
    );

  const ratioTotal = form?.chemicals.reduce((sum, c) => sum + (Number(c.ratio) || 0), 0) ?? 0;

  return (
    <>
      <DataToolbar
        search={search}
        onSearchChange={setSearch}
        onRefresh={() => list.refetch()}
        onCreate={() => setForm({ ...EMPTY_FABRIC, chemicals: [] })}
        createLabel="Yeni Kumaş"
        canCreate={canEdit('KUMAS', 'create')}
        count={list.data?.length}
      />

      <AnalyticalTable
        columns={columns}
        data={list.data ?? []}
        loading={list.isLoading}
        visibleRows={13}
        filterable
        noDataText="Kayıtlı kumaş bulunamadı."
      />

      {form && (
        <Dialog
          open
          headerText={form.id ? `Kumaş Düzenle - ${form.code}` : 'Yeni Kumaş Tanımı'}
          onClose={() => setForm(null)}
          footer={
            <Bar
              design="Footer"
              endContent={
                <>
                  <Button design="Transparent" onClick={() => setForm(null)}>
                    Vazgeç
                  </Button>
                  <Button
                    design="Emphasized"
                    disabled={!form.code || !form.name || save.isPending}
                    onClick={() => {
                      const { id, ...data } = form;
                      save.mutate({ id, data }, { onSuccess: () => setForm(null) });
                    }}
                  >
                    Kaydet
                  </Button>
                </>
              }
            />
          }
        >
          <div style={{ minWidth: 'min(760px, 85vw)', padding: '0.5rem 0' }}>
            <Form layout="S1 M2 L2 XL2">
              <FormGroup headerText="Tanım">
                <FormItem labelContent={<Label required>Kumaş Kodu</Label>}>
                  <Input
                    value={form.code}
                    onInput={(e) => update({ code: e.target.value })}
                    placeholder="KM-001"
                  />
                </FormItem>
                <FormItem labelContent={<Label required>Kumaş Adı</Label>}>
                  <Input value={form.name} onInput={(e) => update({ name: e.target.value })} />
                </FormItem>
                <FormItem labelContent={<Label>Tip</Label>}>
                  <Input
                    value={form.type ?? ''}
                    onInput={(e) => update({ type: e.target.value })}
                    placeholder="Keçe / Dokuma / Nonwoven / Sisal"
                  />
                </FormItem>
                <FormItem labelContent={<Label>Kompozisyon</Label>}>
                  <Input
                    value={form.composition ?? ''}
                    onInput={(e) => update({ composition: e.target.value })}
                    placeholder="%100 Pamuk"
                  />
                </FormItem>
              </FormGroup>

              <FormGroup headerText="Teknik Özellikler">
                <FormItem labelContent={<Label>Gramaj (g/m²)</Label>}>
                  <Input
                    type="Number"
                    value={form.gramaj?.toString() ?? ''}
                    onInput={(e) =>
                      update({ gramaj: e.target.value === '' ? null : Number(e.target.value) })
                    }
                  />
                </FormItem>
                <FormItem labelContent={<Label>En (mm)</Label>}>
                  <Input
                    type="Number"
                    value={form.width?.toString() ?? ''}
                    onInput={(e) =>
                      update({ width: e.target.value === '' ? null : Number(e.target.value) })
                    }
                  />
                </FormItem>
                <FormItem labelContent={<Label>Kalınlık (mm)</Label>}>
                  <Input
                    type="Number"
                    value={form.thickness?.toString() ?? ''}
                    onInput={(e) =>
                      update({ thickness: e.target.value === '' ? null : Number(e.target.value) })
                    }
                  />
                </FormItem>
                <FormItem labelContent={<Label>Renk</Label>}>
                  <Input
                    value={form.color ?? ''}
                    onInput={(e) => update({ color: e.target.value })}
                  />
                </FormItem>
                <FormItem labelContent={<Label>Tedarikçi</Label>}>
                  <Input
                    value={form.supplier ?? ''}
                    onInput={(e) => update({ supplier: e.target.value })}
                  />
                </FormItem>
                <FormItem labelContent={<Label>Durum</Label>}>
                  <CheckBox
                    text="Aktif"
                    checked={form.isActive}
                    onChange={(e) => update({ isActive: e.target.checked })}
                  />
                </FormItem>
              </FormGroup>
            </Form>

            <div style={{ marginTop: '1.25rem' }}>
              <Title level="H5">Emdirilecek Kimyasallar</Title>
              <div className="mp-page__subtitle" style={{ marginBottom: '0.5rem' }}>
                Bu kumaş için varsayılan kimyasal oranları. Üretim emrinde reçete
                seçilmezse bu oranlar referans alınır.
              </div>

              {form.chemicals.length > 0 && Math.abs(ratioTotal - 100) > 0.01 && (
                <MessageStrip design="Critical" hideCloseButton style={{ marginBottom: '0.5rem' }}>
                  Oran toplamı %{ratioTotal.toFixed(2)}. Reçetelerde toplam %100 olmalıdır.
                </MessageStrip>
              )}

              <table className="mp-perm-table">
                <caption className="mp-visually-hidden">Kumaşa emdirilecek kimyasallar ve oranları</caption>
                <thead>
                  <tr>
                    <th scope="col" style={{ width: '55%' }}>Kimyasal</th>
                    <th scope="col" style={{ width: '20%' }}>Oran (%)</th>
                    <th scope="col" style={{ width: '20%' }}>Not</th>
                    <th scope="col" style={{ width: '5%' }} />
                  </tr>
                </thead>
                <tbody>
                  {form.chemicals.map((row, index) => (
                    <tr key={index}>
                      <td>
                        <UiSelect
                          style={{ width: '100%' }}
                          value={row.chemicalId}
                          placeholder="Seçiniz"
                          options={(chemicals.list.data ?? []).map((chem) => ({
                            value: chem.id,
                            label: `${chem.code} - ${chem.name}`,
                          }))}
                          onSelect={(chemicalId) => updateChemical(index, { chemicalId })}
                        />
                      </td>
                      <td>
                        <Input
                          type="Number"
                          style={{ width: '100%' }}
                          value={String(row.ratio ?? 0)}
                          onInput={(e) => updateChemical(index, { ratio: Number(e.target.value) })}
                        />
                      </td>
                      <td>
                        <Input
                          style={{ width: '100%' }}
                          value={row.notes ?? ''}
                          onInput={(e) => updateChemical(index, { notes: e.target.value })}
                        />
                      </td>
                      <td>
                        <Button
                          design="Transparent"
                          icon="decline"
                          onClick={() =>
                            update({ chemicals: form.chemicals.filter((_, i) => i !== index) })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                  {form.chemicals.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ color: 'var(--sapContent_LabelColor)' }}>
                        Henüz kimyasal eklenmedi.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <Button
                icon="add"
                design="Transparent"
                style={{ marginTop: '0.5rem' }}
                onClick={() =>
                  update({
                    chemicals: [...form.chemicals, { chemicalId: '', ratio: 0, notes: '' }],
                  })
                }
              >
                Kimyasal Ekle
              </Button>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <Label>Notlar</Label>
              <TextArea
                rows={2}
                style={{ width: '100%' }}
                value={form.notes ?? ''}
                onInput={(e) => update({ notes: e.target.value })}
              />
            </div>
          </div>
        </Dialog>
      )}

      {deleteTarget && (
        <MessageBox
          open
          type="Warning"
          titleText="Kumaş Sil"
          actions={['Sil', 'Vazgeç']}
          onClose={(action) => {
            if (action === 'Sil') remove.mutate(deleteTarget.id);
            setDeleteTarget(null);
          }}
        >
          <strong>{deleteTarget.code}</strong> - {deleteTarget.name} kaydını silmek istediğinize
          emin misiniz?
        </MessageBox>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// KIMYASAL SEKMESI
// ---------------------------------------------------------------------------

function ChemicalsTab({ canEdit }: { canEdit: CanFn }) {
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<ChemicalForm | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Chemical | null>(null);

  const { list, save, remove } = useEntity<Chemical>('/chemicals', { search });

  const columns = useMemo(
    () => tableColumns<Chemical>([
      { Header: 'Kimyasal Kodu', accessor: 'code', width: 150 },
      { Header: 'Adı', accessor: 'name', minWidth: 240 },
      { Header: 'Tip', accessor: 'type', width: 150 },
      { Header: 'Birim', accessor: 'unit', width: 90 },
      {
        Header: 'Yoğunluk',
        accessor: 'density',
        width: 110,
        hAlign: 'End' as const,
        Cell: ({ value }: { value?: number }) => formatNumber(value, 2),
      },
      { Header: 'Tedarikçi', accessor: 'supplier', width: 170 },
      { Header: 'Güvenlik Notu', accessor: 'hazardNote', minWidth: 200 },
      {
        Header: 'Durum',
        accessor: 'isActive',
        width: 100,
        Cell: ({ value }: { value: boolean }) => (
          <ObjectStatus state={value ? 'Positive' : 'None'}>
            {value ? 'Aktif' : 'Pasif'}
          </ObjectStatus>
        ),
      },
      {
        Header: 'İşlem',
        id: 'actions',
        width: 110,
        disableFilters: true,
        disableSortBy: true,
        Cell: ({ row }: { row: { original: Chemical } }) => (
          <div className="mp-inline-actions">
            {canEdit('KUMAS', 'edit') && (
              <Button
                design="Transparent"
                icon="edit"
                tooltip="Düzenle"
                onClick={() => setForm({ ...row.original })}
              />
            )}
            {canEdit('KUMAS', 'delete') && (
              <Button
                design="Transparent"
                icon="delete"
                tooltip="Sil"
                onClick={() => setDeleteTarget(row.original)}
              />
            )}
          </div>
        ),
      },
    ]),
    [canEdit],
  );

  const update = (patch: Partial<ChemicalForm>) =>
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));

  return (
    <>
      <DataToolbar
        search={search}
        onSearchChange={setSearch}
        onRefresh={() => list.refetch()}
        onCreate={() => setForm({ ...EMPTY_CHEMICAL })}
        createLabel="Yeni Kimyasal"
        canCreate={canEdit('KUMAS', 'create')}
        count={list.data?.length}
      />

      <AnalyticalTable
        columns={columns}
        data={list.data ?? []}
        loading={list.isLoading}
        visibleRows={13}
        filterable
        noDataText="Kayıtlı kimyasal bulunamadı."
      />

      {form && (
        <Dialog
          open
          headerText={form.id ? `Kimyasal Düzenle - ${form.code}` : 'Yeni Kimyasal Tanımı'}
          onClose={() => setForm(null)}
          footer={
            <Bar
              design="Footer"
              endContent={
                <>
                  <Button design="Transparent" onClick={() => setForm(null)}>
                    Vazgeç
                  </Button>
                  <Button
                    design="Emphasized"
                    disabled={!form.code || !form.name || save.isPending}
                    onClick={() => {
                      const { id, ...data } = form;
                      save.mutate({ id, data }, { onSuccess: () => setForm(null) });
                    }}
                  >
                    Kaydet
                  </Button>
                </>
              }
            />
          }
        >
          <div style={{ minWidth: 'min(640px, 80vw)', padding: '0.5rem 0' }}>
            <Form layout="S1 M2 L2 XL2">
              <FormGroup headerText="Tanım">
                <FormItem labelContent={<Label required>Kimyasal Kodu</Label>}>
                  <Input
                    value={form.code}
                    onInput={(e) => update({ code: e.target.value })}
                    placeholder="CH-001"
                  />
                </FormItem>
                <FormItem labelContent={<Label required>Kimyasal Adı</Label>}>
                  <Input value={form.name} onInput={(e) => update({ name: e.target.value })} />
                </FormItem>
                <FormItem labelContent={<Label>Tip</Label>}>
                  <Input
                    value={form.type ?? ''}
                    onInput={(e) => update({ type: e.target.value })}
                    placeholder="Reçine / Sertleştirici / Çözücü"
                  />
                </FormItem>
                <FormItem labelContent={<Label>Ölçü Birimi</Label>}>
                  <UiSelect
                    value={form.unit}
                    options={['kg', 'lt', 'gr', 'ml'].map((unit) => ({
                      value: unit,
                      label: unit,
                    }))}
                    onSelect={(unit) => update({ unit: unit || 'kg' })}
                  />
                </FormItem>
                <FormItem labelContent={<Label>Yoğunluk (g/cm³)</Label>}>
                  <Input
                    type="Number"
                    value={form.density?.toString() ?? ''}
                    onInput={(e) =>
                      update({ density: e.target.value === '' ? null : Number(e.target.value) })
                    }
                  />
                </FormItem>
                <FormItem labelContent={<Label>Tedarikçi</Label>}>
                  <Input
                    value={form.supplier ?? ''}
                    onInput={(e) => update({ supplier: e.target.value })}
                  />
                </FormItem>
              </FormGroup>

              <FormGroup headerText="Güvenlik ve Notlar">
                <FormItem labelContent={<Label>Güvenlik / MSDS Notu</Label>}>
                  <TextArea
                    rows={3}
                    value={form.hazardNote ?? ''}
                    onInput={(e) => update({ hazardNote: e.target.value })}
                  />
                </FormItem>
                <FormItem labelContent={<Label>Notlar</Label>}>
                  <TextArea
                    rows={3}
                    value={form.notes ?? ''}
                    onInput={(e) => update({ notes: e.target.value })}
                  />
                </FormItem>
                <FormItem labelContent={<Label>Durum</Label>}>
                  <CheckBox
                    text="Aktif"
                    checked={form.isActive}
                    onChange={(e) => update({ isActive: e.target.checked })}
                  />
                </FormItem>
              </FormGroup>
            </Form>
          </div>
        </Dialog>
      )}

      {deleteTarget && (
        <MessageBox
          open
          type="Warning"
          titleText="Kimyasal Sil"
          actions={['Sil', 'Vazgeç']}
          onClose={(action) => {
            if (action === 'Sil') remove.mutate(deleteTarget.id);
            setDeleteTarget(null);
          }}
        >
          <strong>{deleteTarget.code}</strong> - {deleteTarget.name} kaydını silmek istediğinize
          emin misiniz?
        </MessageBox>
      )}
    </>
  );
}
