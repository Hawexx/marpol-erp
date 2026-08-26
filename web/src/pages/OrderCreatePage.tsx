import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Button,
  CheckBox,
  DatePicker,
  Form,
  FormGroup,
  FormItem,
  Input,
  Label,
  MessageStrip,
  TextArea,
  Title,
} from '@ui5/webcomponents-react';
import { api, errorMessage } from '../api/client.js';
import { useEntity } from '../api/useEntity.js';
import { useNotify } from '../components/NotificationProvider.js';
import { useAuth } from '../auth/AuthContext.js';
import { PRIORITY_LABEL, PageHeader, formatNumber } from '../components/ui.js';
import { UiSelect } from '../components/UiSelect.js';
import type {
  Chemical,
  Fabric,
  Flange,
  Priority,
  ProductionOrder,
  Recipe,
  Workflow,
} from '../api/types.js';

interface ChemicalRow {
  chemicalId: string;
  ratio: number;
  notes?: string | null;
}

interface OrderForm {
  fabricId: string;
  flangeId: string;
  recipeId: string;
  workflowId: string;
  diskDiameter: string;
  quantity: string;
  layers: string;
  priority: Priority;
  deadline: string;
  plannedStart: string;
  customer: string;
  notes: string;
  chemicals: ChemicalRow[];
  submitForApproval: boolean;
}

const EMPTY: OrderForm = {
  fabricId: '',
  flangeId: '',
  recipeId: '',
  workflowId: '',
  diskDiameter: '',
  quantity: '',
  layers: '1',
  priority: 'NORMAL',
  deadline: '',
  plannedStart: '',
  customer: '',
  notes: '',
  chemicals: [],
  submitForApproval: true,
};

/**
 * dd.MM.yyyy -> ISO. UI5 DatePicker Turkce formatta deger dondurur.
 *
 * Duzenli ifade "31.02.2026" gibi yapisal olarak dogru ama takvimde
 * bulunmayan tarihleri de kabul ediyordu. Bu deger `Invalid Date` uretiyor,
 * `toISOString()` de RangeError firlatiyordu. Cagri render sirasinda
 * yapildigi icin sonuc bos ekran ve doldurulan formun tamamen kaybiydi.
 */
function parseTrDate(value: string): string | null {
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;

  const [, day, month, year] = match;
  const date = new Date(`${year}-${month}-${day}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  // Takvim tasmasini yakala: 31.02 -> 03 Mart olarak normalize edilir.
  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() + 1 !== Number(month) ||
    date.getDate() !== Number(day)
  ) {
    return null;
  }

  return date.toISOString();
}

/** ISO -> dd.MM.yyyy (DatePicker Turkce format bekliyor). */
function isoToTr(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

export default function OrderCreatePage() {
  const navigate = useNavigate();
  const { toast, error: showError } = useNotify();
  const { can } = useAuth();

  // Ayni sayfa hem olusturma hem duzenleme icin kullanilir; rotada id varsa
  // duzenleme modundadir.
  const { id: editId } = useParams<{ id: string }>();
  const isEdit = Boolean(editId);

  const [form, setForm] = useState<OrderForm>({ ...EMPTY });
  const [warning, setWarning] = useState<string | null>(null);

  const existing = useQuery({
    queryKey: ['/orders', editId],
    queryFn: () => api.get<ProductionOrder>(`/orders/${editId}`),
    enabled: isEdit,
  });

  // Duzenlenen emri forma yukle. Yalnizca kayit kimligi degistiginde calisir;
  // aksi halde her yenilemede kullanicinin girdileri ezilir.
  const loadedId = existing.data?.id;
  useEffect(() => {
    const order = existing.data;
    if (!order) return;
    setForm({
      fabricId: order.fabricId,
      flangeId: order.flangeId,
      recipeId: order.recipeId ?? '',
      workflowId: order.workflowId ?? '',
      diskDiameter: String(order.diskDiameter),
      quantity: String(order.quantity),
      layers: String(order.layers),
      priority: order.priority,
      deadline: isoToTr(order.deadline),
      plannedStart: isoToTr(order.plannedStart),
      customer: order.customer ?? '',
      notes: order.notes ?? '',
      chemicals: order.chemicals.map((c) => ({
        chemicalId: c.chemicalId,
        ratio: c.ratio,
        notes: c.notes ?? '',
      })),
      submitForApproval: order.status !== 'TASLAK',
    });
    setWarning(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedId]);

  const fabrics = useEntity<Fabric>('/fabrics', { activeOnly: true });
  const flanges = useEntity<Flange>('/flanges', { activeOnly: true });
  const recipes = useEntity<Recipe>('/recipes', { activeOnly: true });
  const workflows = useEntity<Workflow>('/workflows', { activeOnly: true });
  const chemicals = useEntity<Chemical>('/chemicals', { activeOnly: true });

  const chemicalById = useMemo(
    () => new Map((chemicals.list.data ?? []).map((c) => [c.id, c])),
    [chemicals.list.data],
  );

  const update = (patch: Partial<OrderForm>) => setForm((prev) => ({ ...prev, ...patch }));

  /**
   * Kimyasal satirlarini onceki duruma gore gunceller.
   *
   * Satir islemleri eskiden yamayi render kapsamindaki `form`dan hesapliyordu.
   * React 18 ayni tick'teki guncellemeleri toplu isledigi icin (ornegin bir
   * Select degisimi ile bir Input olayi ayni anda dustugunde) ikinci
   * guncelleme birincisini sessizce eziyor, yapilan degisiklik kayboluyordu.
   */
  const updateChemicals = (updater: (rows: OrderForm['chemicals']) => OrderForm['chemicals']) =>
    setForm((prev) => ({ ...prev, chemicals: updater(prev.chemicals) }));

  /** Recete secildiginde kimyasal oranlarini otomatik doldur. */
  function selectRecipe(recipeId: string) {
    const recipe = recipes.list.data?.find((r) => r.id === recipeId);
    update({
      recipeId,
      chemicals: recipe
        ? recipe.items.map((item) => ({
            chemicalId: item.chemicalId,
            ratio: item.ratio,
            notes: item.notes,
          }))
        : form.chemicals,
    });
    setWarning(recipe ? 'Reçete oranları yüklendi. Gerekirse bu emir için değiştirebilirsiniz.' : null);
  }

  /** Kumas secildiginde, o kumasin varsayilan kimyasallarini oner. */
  function selectFabric(fabricId: string) {
    const fabric = fabrics.list.data?.find((f) => f.id === fabricId);
    if (fabric && fabric.chemicals.length > 0 && form.chemicals.length === 0) {
      update({
        fabricId,
        chemicals: fabric.chemicals.map((c) => ({
          chemicalId: c.chemicalId,
          ratio: c.ratio,
          notes: c.notes,
        })),
      });
      setWarning(`${fabric.name} için tanımlı varsayılan kimyasal oranları yüklendi.`);
      return;
    }
    update({ fabricId });
  }

  const ratioTotal = form.chemicals.reduce((sum, row) => sum + (Number(row.ratio) || 0), 0);
  const ratioOk = form.chemicals.length > 0 && Math.abs(ratioTotal - 100) <= 0.01;
  // "Seçiniz" konumunda birakilmis satir sunucuya bos chemicalId ile gidiyor
  // ve anlasilmaz bir UUID dogrulama hatasi donuyordu.
  const chemicalsChosen = form.chemicals.every((row) => Boolean(row.chemicalId));

  const create = useMutation({
    mutationFn: (payload: unknown) => api.post<ProductionOrder>('/orders', payload),
    onSuccess: (order) => {
      toast(`${order.orderNo} numaralı üretim emri oluşturuldu.`);
      setForm({ ...EMPTY, chemicals: [] });
      if (can('URETIM_EMIRLERI')) navigate('/uretim-emirleri');
    },
    onError: (err) => showError(errorMessage(err)),
  });

  const updateOrder = useMutation({
    mutationFn: (payload: unknown) => api.put<ProductionOrder>(`/orders/${editId}`, payload),
    onSuccess: (order) => {
      toast(`${order.orderNo} güncellendi.`);
      navigate('/uretim-emirleri');
    },
    onError: (err) => showError(errorMessage(err)),
  });

  const busy = create.isPending || updateOrder.isPending;
  const orderNo = existing.data?.orderNo;

  const deadlineIso = parseTrDate(form.deadline);

  const valid =
    Boolean(form.fabricId) &&
    Boolean(form.flangeId) &&
    Number(form.diskDiameter) > 0 &&
    Number(form.quantity) > 0 &&
    Number(form.layers) >= 1 &&
    Boolean(deadlineIso) &&
    ratioOk &&
    chemicalsChosen;

  function submit() {
    if (!valid) return;
    const payload = {
      fabricId: form.fabricId,
      flangeId: form.flangeId,
      recipeId: form.recipeId || null,
      workflowId: form.workflowId || null,
      diskDiameter: Number(form.diskDiameter),
      quantity: Number(form.quantity),
      layers: Number(form.layers),
      priority: form.priority,
      deadline: deadlineIso,
      plannedStart: parseTrDate(form.plannedStart),
      customer: form.customer || null,
      notes: form.notes || null,
      // Durumu sunucu belirler; istemci yalnizca onaya gonderilip
      // gonderilmeyecegini bildirir.
      submitForApproval: form.submitForApproval,
      chemicals: form.chemicals.map((row, index) => ({
        chemicalId: row.chemicalId,
        ratio: Number(row.ratio),
        sortOrder: index,
        notes: row.notes ?? null,
      })),
    };
    // Sunucu tarafinda gonderilmeyen alan korunur; duzenlemede tum alanlar
    // acikca gonderildigi icin form neyi gosteriyorsa o kaydedilir.
    if (isEdit) updateOrder.mutate(payload);
    else create.mutate(payload);
  }

  return (
    <div className="mp-page">
      <PageHeader
        title={isEdit ? `Üretim Emri Düzenle${orderNo ? ` - ${orderNo}` : ''}` : 'Üretim Emri Oluşturma'}
        subtitle={
          isEdit
            ? 'Mevcut emrin bilgilerini güncelleyin'
            : 'Üretim hattına düşecek disk cila fırçası emrini tanımlayın'
        }
        actions={
          <>
            <Button
              design="Transparent"
              onClick={() => {
                if (isEdit) {
                  navigate('/uretim-emirleri');
                  return;
                }
                setForm({ ...EMPTY, chemicals: [] });
                setWarning(null);
              }}
            >
              {isEdit ? 'Vazgeç' : 'Formu Temizle'}
            </Button>
            <Button design="Emphasized" icon="save" disabled={!valid || busy} onClick={submit}>
              {isEdit
                ? 'Değişiklikleri Kaydet'
                : form.submitForApproval
                  ? 'Emri Oluştur ve Onaya Gönder'
                  : 'Taslak Olarak Kaydet'}
            </Button>
          </>
        }
      />

      {isEdit && existing.isLoading && (
        <MessageStrip design="Information" hideCloseButton style={{ marginBottom: '0.75rem' }}>
          Emir yükleniyor...
        </MessageStrip>
      )}
      {isEdit && existing.isError && (
        <MessageStrip design="Negative" hideCloseButton style={{ marginBottom: '0.75rem' }}>
          Emir yüklenemedi. Listeye dönüp tekrar deneyin.
        </MessageStrip>
      )}

      {warning && (
        <MessageStrip design="Information" onClose={() => setWarning(null)} style={{ marginBottom: '0.75rem' }}>
          {warning}
        </MessageStrip>
      )}

      <div className="mp-card">
        <Form layout="S1 M2 L3 XL3">
          <FormGroup headerText="Ürün Tanımı">
            <FormItem labelContent={<Label required>Kumaş Çeşidi</Label>}>
              <UiSelect
                style={{ width: '100%' }}
                value={form.fabricId}
                placeholder="Seçiniz"
                options={(fabrics.list.data ?? []).map((f) => ({
                  value: f.id,
                  label: `${f.code} - ${f.name}`,
                }))}
                onSelect={selectFabric}
              />
            </FormItem>

            <FormItem labelContent={<Label required>Flanş Çeşidi</Label>}>
              <UiSelect
                style={{ width: '100%' }}
                value={form.flangeId}
                placeholder="Seçiniz"
                options={(flanges.list.data ?? []).map((f) => ({
                  value: f.id,
                  label: `${f.code} - ${f.name}`,
                }))}
                onSelect={(flangeId) => update({ flangeId })}
              />
            </FormItem>

            <FormItem labelContent={<Label>Müşteri</Label>}>
              <Input
                style={{ width: '100%' }}
                value={form.customer}
                onInput={(e) => update({ customer: e.target.value })}
              />
            </FormItem>
          </FormGroup>

          <FormGroup headerText="Disk Fırça Özellikleri">
            <FormItem labelContent={<Label required>Disk Çapı (mm)</Label>}>
              <Input
                type="Number"
                style={{ width: '100%' }}
                value={form.diskDiameter}
                onInput={(e) => update({ diskDiameter: e.target.value })}
              />
            </FormItem>
            <FormItem labelContent={<Label required>Üretim Adedi</Label>}>
              <Input
                type="Number"
                style={{ width: '100%' }}
                value={form.quantity}
                onInput={(e) => update({ quantity: e.target.value })}
              />
            </FormItem>
            <FormItem labelContent={<Label required>Katman Sayısı</Label>}>
              <Input
                type="Number"
                style={{ width: '100%' }}
                value={form.layers}
                onInput={(e) => update({ layers: e.target.value })}
              />
            </FormItem>
          </FormGroup>

          <FormGroup headerText="Planlama">
            <FormItem labelContent={<Label required>Aciliyet</Label>}>
              <UiSelect
                style={{ width: '100%' }}
                value={form.priority}
                options={(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => ({
                  value: p,
                  label: PRIORITY_LABEL[p],
                }))}
                onSelect={(priority) => update({ priority: priority as Priority })}
              />
            </FormItem>

            <FormItem labelContent={<Label required>Termin (Deadline)</Label>}>
              <DatePicker
                style={{ width: '100%' }}
                formatPattern="dd.MM.yyyy"
                value={form.deadline}
                onChange={(e) => update({ deadline: e.target.value })}
              />
            </FormItem>

            <FormItem labelContent={<Label>Planlanan Başlangıç</Label>}>
              <DatePicker
                style={{ width: '100%' }}
                formatPattern="dd.MM.yyyy"
                value={form.plannedStart}
                onChange={(e) => update({ plannedStart: e.target.value })}
              />
            </FormItem>

            <FormItem labelContent={<Label>Üretim Proses Şeması</Label>}>
              <UiSelect
                style={{ width: '100%' }}
                value={form.workflowId}
                placeholder="(Seçilmedi)"
                options={(workflows.list.data ?? []).map((w) => ({
                  value: w.id,
                  label: `${w.code} - ${w.name}`,
                }))}
                onSelect={(workflowId) => update({ workflowId })}
              />
            </FormItem>
          </FormGroup>
        </Form>
      </div>

      <div className="mp-card" style={{ marginTop: '1rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div>
            <Title level="H5">Kumaşa Emdirilecek Kimyasal Oranlaması</Title>
            <div className="mp-page__subtitle">
              Hazır bir reçete seçebilir veya oranları bu emre özel girebilirsiniz.
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Label showColon>Reçete</Label>
            <UiSelect
              style={{ minWidth: '260px' }}
              value={form.recipeId}
              placeholder="(Reçete kullanma)"
              options={(recipes.list.data ?? []).map((r) => ({
                value: r.id,
                label: `${r.code} - ${r.name}`,
              }))}
              onSelect={selectRecipe}
            />
          </div>
        </div>

        {form.chemicals.length > 0 && !ratioOk && (
          <MessageStrip design="Negative" hideCloseButton style={{ margin: '0.75rem 0' }}>
            Kimyasal oranlarının toplamı %100 olmalıdır. Şu anki toplam: %{ratioTotal.toFixed(2)}
          </MessageStrip>
        )}

        <table className="mp-perm-table" style={{ marginTop: '0.75rem' }}>
          <thead>
            <tr>
              <th style={{ width: '40%' }}>Kimyasal</th>
              <th style={{ width: '12%' }}>Kod</th>
              <th style={{ width: '15%' }}>Oran (%)</th>
              <th style={{ width: '15%' }}>Tahmini Miktar</th>
              <th style={{ width: '13%' }}>Not</th>
              <th style={{ width: '5%' }} />
            </tr>
          </thead>
          <tbody>
            {form.chemicals.map((row, index) => {
              const chem = chemicalById.get(row.chemicalId);
              // 1 adet ~ referans olarak 1 kg karisim varsayilir; miktar bilgilendirme amaclidir.
              const amount = Number(form.quantity)
                ? (Number(form.quantity) * (Number(row.ratio) || 0)) / 100
                : null;
              return (
                <tr key={index}>
                  <td>
                    <UiSelect
                      style={{ width: '100%' }}
                      value={row.chemicalId}
                      placeholder="Seçiniz"
                      options={(chemicals.list.data ?? []).map((c) => ({
                        value: c.id,
                        label: c.name,
                      }))}
                      onSelect={(id) =>
                        updateChemicals((rows) =>
                          rows.map((c, i) => (i === index ? { ...c, chemicalId: id } : c)),
                        )
                      }
                    />
                  </td>
                  <td>{chem?.code ?? '-'}</td>
                  <td>
                    <Input
                      type="Number"
                      style={{ width: '100%' }}
                      value={String(row.ratio ?? 0)}
                      onInput={(e) =>
                        updateChemicals((rows) =>
                          rows.map((c, i) =>
                            i === index ? { ...c, ratio: Number(e.target.value) } : c,
                          ),
                        )
                      }
                    />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {amount === null ? '-' : `${formatNumber(amount, 2)} ${chem?.unit ?? 'kg'}`}
                  </td>
                  <td>
                    <Input
                      style={{ width: '100%' }}
                      value={row.notes ?? ''}
                      onInput={(e) =>
                        updateChemicals((rows) =>
                          rows.map((c, i) => (i === index ? { ...c, notes: e.target.value } : c)),
                        )
                      }
                    />
                  </td>
                  <td>
                    <Button
                      design="Transparent"
                      icon="decline"
                      onClick={() =>
                        updateChemicals((rows) => rows.filter((_, i) => i !== index))
                      }
                    />
                  </td>
                </tr>
              );
            })}
            {form.chemicals.length === 0 && (
              <tr>
                <td colSpan={6} style={{ color: 'var(--sapContent_LabelColor)' }}>
                  Reçete seçin veya elle kimyasal ekleyin.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '0.5rem',
          }}
        >
          <Button
            design="Transparent"
            icon="add"
            onClick={() =>
              updateChemicals((rows) => [...rows, { chemicalId: '', ratio: 0, notes: '' }])
            }
          >
            Kimyasal Ekle
          </Button>
          <span
            style={{
              fontWeight: 600,
              color: ratioOk
                ? 'var(--sapPositiveTextColor, #107e3e)'
                : 'var(--sapNegativeTextColor, #bb0000)',
            }}
          >
            Toplam: %{ratioTotal.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="mp-card" style={{ marginTop: '1rem' }}>
        <Label showColon>Üretim Notları / Özel Talimatlar</Label>
        <TextArea
          rows={3}
          style={{ width: '100%', marginTop: '0.25rem' }}
          value={form.notes}
          onInput={(e) => update({ notes: e.target.value })}
        />
        <div style={{ marginTop: '0.75rem' }}>
          <CheckBox
            text="Kaydettikten sonra onaya gönder (işaretlenmezse taslak olarak kalır)"
            checked={form.submitForApproval}
            onChange={(e) => update({ submitForApproval: e.target.checked })}
          />
        </div>
      </div>
    </div>
  );
}
