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
  MessageStrip,
  ObjectStatus,
  TextArea,
  Title,
} from "@ui5/webcomponents-react";
import { api } from "../api/client.js";
import { useEntity } from "../api/useEntity.js";
import { UiSelect } from "../components/UiSelect.js";
import { useAuth } from "../auth/AuthContext.js";
import { ListSection, PageHeader, formatNumber } from "../components/ui.js";
import { DataToolbar } from "../components/DataToolbar.js";
import { Pagination } from "../components/Pagination.js";
import { useDebounced } from "../lib/useDebounced.js";
import { downloadCsv, stampedFileName, type CsvColumn } from "../lib/csv.js";
import { columns as tableColumns } from "../components/table.js";
import { FormDialog } from "../components/FormDialog.js";
import type { Chemical, Recipe, RecipeItem } from "../api/types.js";

type RecipeForm = Omit<Recipe, "id"> & { id?: string };

const EMPTY: RecipeForm = {
  code: "",
  name: "",
  description: "",
  version: 1,
  batchSize: 100,
  isActive: true,
  items: [],
};

const PAGE_SIZE = 50;

/** Disa aktarilan sutunlar. */
const CSV_COLUMNS: CsvColumn<Recipe>[] = [
  { header: "Kod", value: (r) => r.code },
  { header: "Ad", value: (r) => r.name },
  { header: "Versiyon", value: (r) => r.version },
  { header: "Parti (kg)", value: (r) => r.batchSize },
  { header: "Bileşen Sayısı", value: (r) => r.items.length },
  {
    header: "Bileşenler",
    value: (r) =>
      r.items.map((i) => `${i.chemical?.code} %${i.ratio}`).join(" + "),
  },
  { header: "Durum", value: (r) => (r.isActive ? "Aktif" : "Pasif") },
];

export default function RecipePage() {
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [exportBusy, setExportBusy] = useState(false);
  // Her tus vurusunda sorgu atmamak icin arama gecikmeli uygulanir.
  const debouncedSearch = useDebounced(search, 300);
  const [form, setForm] = useState<RecipeForm | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Recipe | null>(null);

  const {
    list,
    save,
    remove,
    total: recordCount,
  } = useEntity<Recipe>("/recipes", {
    search: debouncedSearch,
    page,
    pageSize: PAGE_SIZE,
  });
  const chemicals = useEntity<Chemical>("/chemicals", { activeOnly: true });

  // Arama degisince ilk sayfaya don; aksi halde bos sayfada kalinabilir.
  useEffect(() => setPage(1), [debouncedSearch]);

  const exportCsv = useCallback(async () => {
    setExportBusy(true);
    try {
      // Disa aktarma sayfayla sinirli olmamali: tum kayitlar cekilir.
      const all = await api.get<{ rows: Recipe[] } | Recipe[]>(
        `/recipes?pageSize=500&page=1${debouncedSearch ? `&q=${encodeURIComponent(debouncedSearch)}` : ""}`,
      );
      const rows = Array.isArray(all) ? all : all.rows;
      downloadCsv(stampedFileName("receteler"), rows, CSV_COLUMNS);
    } finally {
      setExportBusy(false);
    }
  }, [debouncedSearch]);

  const columns = useMemo(
    () =>
      tableColumns<Recipe>([
        { Header: "Reçete Kodu", accessor: "code", width: 140 },
        { Header: "Reçete Adı", accessor: "name", minWidth: 220 },
        { Header: "Açıklama", accessor: "description", minWidth: 220 },
        {
          Header: "Versiyon",
          accessor: "version",
          width: 100,
          hAlign: "End" as const,
        },
        {
          Header: "Referans Miktar (kg)",
          accessor: "batchSize",
          width: 170,
          hAlign: "End" as const,
          Cell: ({ value }: { value?: number }) => formatNumber(value, 1),
        },
        {
          Header: "Bileşim",
          id: "composition",
          minWidth: 320,
          disableFilters: true,
          Cell: ({ row }: { row: { original: Recipe } }) =>
            row.original.items
              .map((item) => `${item.chemical?.code ?? ""} %${item.ratio}`)
              .join("  +  "),
        },
        {
          Header: "Durum",
          accessor: "isActive",
          width: 100,
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
          Cell: ({ row }: { row: { original: Recipe } }) => (
            <div className="mp-inline-actions">
              {can("KIMYASAL_RECETE", "edit") && (
                <Button
                  design="Transparent"
                  icon="edit"
                  tooltip="Düzenle"
                  onClick={() =>
                    setForm({
                      ...row.original,
                      items: row.original.items.map((item) => ({
                        chemicalId: item.chemicalId,
                        ratio: item.ratio,
                        sortOrder: item.sortOrder,
                        notes: item.notes,
                      })),
                    })
                  }
                />
              )}
              {can("KIMYASAL_RECETE", "delete") && (
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

  const update = (patch: Partial<RecipeForm>) =>
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));

  const updateItem = (index: number, patch: Partial<RecipeItem>) =>
    setForm((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((it, i) =>
              i === index ? { ...it, ...patch } : it,
            ),
          }
        : prev,
    );

  const total =
    form?.items.reduce((sum, item) => sum + (Number(item.ratio) || 0), 0) ?? 0;
  const totalOk = Math.abs(total - 100) <= 0.01;
  const chemicalById = new Map(
    (chemicals.list.data ?? []).map((c) => [c.id, c]),
  );

  return (
    <div className="mp-page">
      <PageHeader
        title="Kimyasal Reçete"
        subtitle="Kumaşa emdirilecek kimyasal karışım reçeteleri (toplam oran %100 olmalıdır)"
      />

      <DataToolbar
        search={search}
        onSearchChange={setSearch}
        onRefresh={() => list.refetch()}
        onCreate={() => setForm({ ...EMPTY, items: [] })}
        createLabel="Yeni Reçete"
        canCreate={can("KIMYASAL_RECETE", "create")}
        count={recordCount}
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
            list.isError ? "Kayıtlar yüklenemedi." : "Kayıtlı reçete bulunamadı."
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
            form.id ? `Reçete Düzenle - ${form.code}` : "Yeni Kimyasal Reçete"
          }
          onClose={() => setForm(null)}
          onSave={() => {
            const { id, ...data } = form;
            save.mutate(
              {
                id,
                data: {
                  ...data,
                  items: data.items.map((item, index) => ({
                    ...item,
                    sortOrder: index,
                  })),
                },
              },
              { onSuccess: () => setForm(null) },
            );
          }}
          saveDisabled={
            !form.code || !form.name || !totalOk || form.items.length === 0
          }
          busy={save.isPending}
          width="min(780px, 85vw)"
          footerStart={
            <span
              style={{
                fontWeight: 600,
                color: totalOk
                  ? "var(--sapPositiveTextColor, #107e3e)"
                  : "var(--sapNegativeTextColor, #bb0000)",
              }}
            >
              Toplam Oran: %{total.toFixed(2)}
            </span>
          }
        >
          <Form layout="S1 M2 L2 XL2">
            <FormGroup headerText="Reçete Bilgileri">
              <FormItem labelContent={<Label required>Reçete Kodu</Label>}>
                <Input
                  value={form.code}
                  onInput={(e) => update({ code: e.target.value })}
                  placeholder="RC-001"
                />
              </FormItem>
              <FormItem labelContent={<Label required>Reçete Adı</Label>}>
                <Input
                  value={form.name}
                  onInput={(e) => update({ name: e.target.value })}
                />
              </FormItem>
              <FormItem labelContent={<Label>Versiyon</Label>}>
                <Input
                  type="Number"
                  value={String(form.version)}
                  onInput={(e) =>
                    update({ version: Number(e.target.value) || 1 })
                  }
                />
              </FormItem>
              <FormItem labelContent={<Label>Referans Karışım (kg)</Label>}>
                <Input
                  type="Number"
                  value={form.batchSize?.toString() ?? ""}
                  onInput={(e) =>
                    update({
                      batchSize:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </FormItem>
              <FormItem labelContent={<Label>Açıklama</Label>}>
                <TextArea
                  rows={2}
                  value={form.description ?? ""}
                  onInput={(e) => update({ description: e.target.value })}
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

          <div style={{ marginTop: "1.25rem" }}>
            <Title level="H2" size="H5">Reçete Bileşenleri</Title>
            {!totalOk && form.items.length > 0 && (
              <MessageStrip
                design="Negative"
                hideCloseButton
                style={{ margin: "0.5rem 0" }}
              >
                Kimyasal oranlarının toplamı %100 olmalıdır. Şu anki toplam: %
                {total.toFixed(2)}
              </MessageStrip>
            )}

            <table className="mp-perm-table" style={{ marginTop: "0.5rem" }}>
              <thead>
                <tr>
                  <th style={{ width: "40%" }}>Kimyasal</th>
                  <th style={{ width: "15%" }}>Oran (%)</th>
                  <th style={{ width: "18%" }}>Miktar</th>
                  <th style={{ width: "22%" }}>Not</th>
                  <th style={{ width: "5%" }} />
                </tr>
              </thead>
              <tbody>
                {form.items.map((item, index) => {
                  const chem = chemicalById.get(item.chemicalId);
                  const amount = form.batchSize
                    ? (form.batchSize * (Number(item.ratio) || 0)) / 100
                    : null;
                  return (
                    <tr key={index}>
                      <td>
                        <UiSelect
                          style={{ width: "100%" }}
                          value={item.chemicalId}
                          placeholder="Seçiniz"
                          options={(chemicals.list.data ?? []).map((c) => ({
                            value: c.id,
                            label: `${c.code} - ${c.name}`,
                          }))}
                          onSelect={(chemicalId) =>
                            updateItem(index, { chemicalId })
                          }
                        />
                      </td>
                      <td>
                        <Input
                          type="Number"
                          style={{ width: "100%" }}
                          value={String(item.ratio ?? 0)}
                          onInput={(e) =>
                            updateItem(index, { ratio: Number(e.target.value) })
                          }
                        />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {amount === null
                          ? "-"
                          : `${formatNumber(amount, 2)} ${chem?.unit ?? "kg"}`}
                      </td>
                      <td>
                        <Input
                          style={{ width: "100%" }}
                          value={item.notes ?? ""}
                          onInput={(e) =>
                            updateItem(index, { notes: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        <Button
                          design="Transparent"
                          icon="decline"
                          onClick={() =>
                            update({
                              items: form.items.filter((_, i) => i !== index),
                            })
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
                {form.items.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      style={{ color: "var(--sapContent_LabelColor)" }}
                    >
                      Reçeteye en az bir kimyasal ekleyin.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <Button
              icon="add"
              design="Transparent"
              style={{ marginTop: "0.5rem" }}
              onClick={() =>
                update({
                  items: [
                    ...form.items,
                    {
                      chemicalId: "",
                      ratio: 0,
                      sortOrder: form.items.length,
                      notes: "",
                    },
                  ],
                })
              }
            >
              Bileşen Ekle
            </Button>
          </div>
        </FormDialog>
      )}

      {deleteTarget && (
        <MessageBox
          open
          type="Warning"
          titleText="Reçete Sil"
          actions={["Sil", "Vazgeç"]}
          onClose={(action) => {
            if (action === "Sil") remove.mutate(deleteTarget.id);
            setDeleteTarget(null);
          }}
        >
          <strong>{deleteTarget.code}</strong> - {deleteTarget.name} reçetesini
          silmek istediğinize emin misiniz?
        </MessageBox>
      )}
    </div>
  );
}
