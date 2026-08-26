import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AnalyticalTable,
  Button,
  CheckBox,
  Form,
  FormGroup,
  FormItem,
  Input,
  Label,
  MessageBox,
  ObjectStatus,
  TextArea,
} from "@ui5/webcomponents-react";
import { api } from "../api/client.js";
import { useEntity } from "../api/useEntity.js";
import { useAuth } from "../auth/AuthContext.js";
import { ListSection, PageHeader, formatNumber } from "../components/ui.js";
import { DataToolbar } from "../components/DataToolbar.js";
import { Pagination } from "../components/Pagination.js";
import { useDebounced } from "../lib/useDebounced.js";
import { downloadCsv, stampedFileName, type CsvColumn } from "../lib/csv.js";
import { columns as tableColumns } from "../components/table.js";
import { FormDialog } from "../components/FormDialog.js";
import type { Flange } from "../api/types.js";

type FlangeForm = Omit<Flange, "id"> & { id?: string };

const EMPTY: FlangeForm = {
  code: "",
  name: "",
  material: "",
  outerDiameter: null,
  innerDiameter: null,
  boreDiameter: null,
  thickness: null,
  holeCount: null,
  weight: null,
  supplier: "",
  notes: "",
  isActive: true,
};

const PAGE_SIZE = 50;

/** Disa aktarilan sutunlar. */
const CSV_COLUMNS: CsvColumn<Flange>[] = [
  { header: "Kod", value: (r) => r.code },
  { header: "Ad", value: (r) => r.name },
  { header: "Malzeme", value: (r) => r.material },
  { header: "Dış Çap (mm)", value: (r) => r.outerDiameter },
  { header: "İç Çap (mm)", value: (r) => r.innerDiameter },
  { header: "Delik Çapı (mm)", value: (r) => r.boreDiameter },
  { header: "Kalınlık (mm)", value: (r) => r.thickness },
  { header: "Delik Sayısı", value: (r) => r.holeCount },
  { header: "Ağırlık (gr)", value: (r) => r.weight },
  { header: "Tedarikçi", value: (r) => r.supplier },
  { header: "Durum", value: (r) => (r.isActive ? "Aktif" : "Pasif") },
];

export default function FlangePage() {
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [exportBusy, setExportBusy] = useState(false);
  // Her tus vurusunda sorgu atmamak icin arama gecikmeli uygulanir.
  const debouncedSearch = useDebounced(search, 300);
  const [form, setForm] = useState<FlangeForm | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Flange | null>(null);

  const { list, save, remove, total } = useEntity<Flange>("/flanges", {
    search: debouncedSearch,
    page,
    pageSize: PAGE_SIZE,
  });

  // Arama degisince ilk sayfaya don; aksi halde bos sayfada kalinabilir.
  useEffect(() => setPage(1), [debouncedSearch]);

  const exportCsv = useCallback(async () => {
    setExportBusy(true);
    try {
      // Disa aktarma sayfayla sinirli olmamali: tum kayitlar cekilir.
      const all = await api.get<{ rows: Flange[] } | Flange[]>(
        `/flanges?pageSize=500&page=1${debouncedSearch ? `&q=${encodeURIComponent(debouncedSearch)}` : ""}`,
      );
      const rows = Array.isArray(all) ? all : all.rows;
      downloadCsv(stampedFileName("flanslar"), rows, CSV_COLUMNS);
    } finally {
      setExportBusy(false);
    }
  }, [debouncedSearch]);

  const columns = useMemo(
    () =>
      tableColumns<Flange>([
        { Header: "Flanş Kodu", accessor: "code", width: 130 },
        { Header: "Tanım", accessor: "name", minWidth: 220 },
        { Header: "Malzeme", accessor: "material", width: 130 },
        {
          Header: "Dış Çap (mm)",
          accessor: "outerDiameter",
          width: 130,
          hAlign: "End" as const,
          Cell: ({ value }: { value?: number }) => formatNumber(value, 1),
        },
        {
          Header: "İç Çap (mm)",
          accessor: "innerDiameter",
          width: 120,
          hAlign: "End" as const,
          Cell: ({ value }: { value?: number }) => formatNumber(value, 1),
        },
        {
          Header: "Mil Deliği (mm)",
          accessor: "boreDiameter",
          width: 140,
          hAlign: "End" as const,
          Cell: ({ value }: { value?: number }) => formatNumber(value, 1),
        },
        {
          Header: "Kalınlık (mm)",
          accessor: "thickness",
          width: 130,
          hAlign: "End" as const,
          Cell: ({ value }: { value?: number }) => formatNumber(value, 1),
        },
        {
          Header: "Delik Adedi",
          accessor: "holeCount",
          width: 120,
          hAlign: "End" as const,
        },
        { Header: "Tedarikçi", accessor: "supplier", width: 160 },
        {
          Header: "Durum",
          accessor: "isActive",
          width: 110,
          Cell: ({ value }: { value: boolean }) => (
            <ObjectStatus state={value ? "Positive" : "None"}>
              {value ? "Aktif" : "Pasif"}
            </ObjectStatus>
          ),
        },
        {
          Header: "İşlem",
          id: "actions",
          width: 110,
          disableFilters: true,
          disableSortBy: true,
          Cell: ({ row }: { row: { original: Flange } }) => (
            <div className="mp-inline-actions">
              {can("FLANS", "edit") && (
                <Button
                  design="Transparent"
                  icon="edit"
                  tooltip="Düzenle"
                  onClick={() => setForm({ ...row.original })}
                />
              )}
              {can("FLANS", "delete") && (
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
    [can],
  );

  const update = (patch: Partial<FlangeForm>) =>
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));

  const numberInput = (label: string, key: keyof FlangeForm) => (
    <FormItem labelContent={<Label>{label}</Label>}>
      <Input
        type="Number"
        value={
          form?.[key] === null || form?.[key] === undefined
            ? ""
            : String(form[key])
        }
        onInput={(e) =>
          update({
            [key]: e.target.value === "" ? null : Number(e.target.value),
          } as Partial<FlangeForm>)
        }
      />
    </FormItem>
  );

  return (
    <div className="mp-page">
      <PageHeader
        title="Flanş Çeşitleri"
        subtitle="Disk fırça gövdesinde kullanılan flanş tanım kartları"
      />

      <DataToolbar
        search={search}
        onSearchChange={setSearch}
        onRefresh={() => list.refetch()}
        onCreate={() => setForm({ ...EMPTY })}
        createLabel="Yeni Flanş"
        canCreate={can("FLANS", "create")}
        count={total}
        onExport={exportCsv}
        exportBusy={exportBusy}
      />

      <ListSection>
        <AnalyticalTable
          columns={columns}
          data={list.data ?? []}
          loading={list.isLoading}
          visibleRows={14}
          filterable
          noDataText={
            list.isError ? "Kayıtlar yüklenemedi." : "Kayıtlı flanş bulunamadı."
          }
        />

        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          busy={list.isFetching}
          onChange={setPage}
        />
      </ListSection>

      {form && (
        <FormDialog
          headerText={
            form.id ? `Flanş Düzenle - ${form.code}` : "Yeni Flanş Tanımı"
          }
          onClose={() => setForm(null)}
          onSave={() => {
            const { id, ...data } = form;
            save.mutate({ id, data }, { onSuccess: () => setForm(null) });
          }}
          saveDisabled={!form.code || !form.name}
          busy={save.isPending}
        >
          <Form layout="S1 M2 L2 XL2">
            <FormGroup headerText="Tanım">
              <FormItem labelContent={<Label required>Flanş Kodu</Label>}>
                <Input
                  value={form.code}
                  onInput={(e) => update({ code: e.target.value })}
                  placeholder="FL-001"
                />
              </FormItem>
              <FormItem labelContent={<Label required>Flanş Adı</Label>}>
                <Input
                  value={form.name}
                  onInput={(e) => update({ name: e.target.value })}
                />
              </FormItem>
              <FormItem labelContent={<Label>Malzeme</Label>}>
                <Input
                  value={form.material ?? ""}
                  onInput={(e) => update({ material: e.target.value })}
                  placeholder="Plastik / Alüminyum / Sac"
                />
              </FormItem>
              <FormItem labelContent={<Label>Tedarikçi</Label>}>
                <Input
                  value={form.supplier ?? ""}
                  onInput={(e) => update({ supplier: e.target.value })}
                />
              </FormItem>
            </FormGroup>

            <FormGroup headerText="Ölçüler">
              {numberInput("Dış Çap (mm)", "outerDiameter")}
              {numberInput("İç Çap (mm)", "innerDiameter")}
              {numberInput("Mil Deliği Çapı (mm)", "boreDiameter")}
              {numberInput("Kalınlık (mm)", "thickness")}
              {numberInput("Vida Deliği Adedi", "holeCount")}
              {numberInput("Ağırlık (gr)", "weight")}
            </FormGroup>

            <FormGroup headerText="Diğer">
              <FormItem labelContent={<Label>Notlar</Label>}>
                <TextArea
                  rows={3}
                  value={form.notes ?? ""}
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
        </FormDialog>
      )}

      {deleteTarget && (
        <MessageBox
          open
          type="Warning"
          titleText="Flanş Sil"
          actions={["Sil", "Vazgeç"]}
          onClose={(action) => {
            if (action === "Sil") remove.mutate(deleteTarget.id);
            setDeleteTarget(null);
          }}
        >
          <strong>{deleteTarget.code}</strong> - {deleteTarget.name} kaydını
          silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
        </MessageBox>
      )}
    </div>
  );
}
