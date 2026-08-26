import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  CheckBox,
  Form,
  FormGroup,
  FormItem,
  Input,
  Label,
  MessageBox,
  ObjectStatus,
} from "@ui5/webcomponents-react";
import { api } from "../api/client.js";
import { useEntity } from "../api/useEntity.js";
import { useAuth } from "../auth/AuthContext.js";
import { ListSection, PageHeader, formatNumber } from "../components/ui.js";
import { DataToolbar } from "../components/DataToolbar.js";
import { Pagination } from "../components/Pagination.js";
import { useDebounced } from "../lib/useDebounced.js";
import { downloadCsv, stampedFileName, type CsvColumn } from "../lib/csv.js";
import { DataTable } from '../components/DataTable.js';
import { tableEmptyText } from '../components/states.js';
import { actionColumn, columns as tableColumns } from "../components/table.js";
import { FormDialog } from "../components/FormDialog.js";
import type { Machine } from "../api/types.js";

type MachineForm = Omit<Machine, "id"> & { id?: string };

const EMPTY: MachineForm = {
  code: "",
  name: "",
  line: "",
  capacity: null,
  location: "",
  isActive: true,
};

const PAGE_SIZE = 50;

const CSV_COLUMNS: CsvColumn<Machine>[] = [
  { header: "Kod", value: (r) => r.code },
  { header: "Ad", value: (r) => r.name },
  { header: "Hat", value: (r) => r.line },
  { header: "Kapasite (adet/saat)", value: (r) => r.capacity },
  { header: "Konum", value: (r) => r.location },
  { header: "Durum", value: (r) => (r.isActive ? "Aktif" : "Pasif") },
];

export default function MachinePage() {
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [exportBusy, setExportBusy] = useState(false);
  const [form, setForm] = useState<MachineForm | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Machine | null>(null);

  const debouncedSearch = useDebounced(search, 300);

  const { list, save, remove, total } = useEntity<Machine>("/machines", {
    search: debouncedSearch,
    page,
    pageSize: PAGE_SIZE,
  });

  useEffect(() => setPage(1), [debouncedSearch]);

  const exportCsv = useCallback(async () => {
    setExportBusy(true);
    try {
      const all = await api.get<{ rows: Machine[] } | Machine[]>(
        `/machines?pageSize=500&page=1${debouncedSearch ? `&q=${encodeURIComponent(debouncedSearch)}` : ""}`,
      );
      const rows = Array.isArray(all) ? all : all.rows;
      downloadCsv(stampedFileName("makineler"), rows, CSV_COLUMNS);
    } finally {
      setExportBusy(false);
    }
  }, [debouncedSearch]);

  const columns = useMemo(
    () =>
      tableColumns<Machine>([
        { Header: "Makine Kodu", accessor: "code", width: 140 },
        { Header: "Makine Adı", accessor: "name", minWidth: 200 },
        { Header: "Üretim Hattı", accessor: "line", width: 150 },
        {
          Header: "Kapasite",
          accessor: "capacity",
          width: 150,
          hAlign: "End" as const,
          Cell: ({ value }: { value?: number | null }) =>
            value ? `${formatNumber(value)} adet/sa` : "-",
        },
        { Header: "Konum", accessor: "location", width: 160 },
        {
          Header: "Durum",
          accessor: "isActive",
          width: 100,
          Cell: ({ value }: { value: boolean }) => (
            <ObjectStatus state={value ? "Positive" : "Negative"}>
              {value ? "Aktif" : "Pasif"}
            </ObjectStatus>
          ),
        },
        {
          ...actionColumn(2),
          Cell: ({ row }: { row: { original: Machine } }) => (
            <div className="mp-inline-actions">
              {can("IS_AKISI", "edit") && (
                <Button
                  design="Transparent"
                  icon="edit"
                  tooltip="Düzenle"
                  onClick={() => setForm({ ...row.original })}
                />
              )}
              {can("IS_AKISI", "delete") && (
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

  const update = (patch: Partial<MachineForm>) =>
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));

  const valid = Boolean(form?.code.trim() && form?.name.trim());

  return (
    <div className="mp-page">
      <PageHeader
        title="Makineler"
        subtitle="Üretim hattındaki makineler ve saatlik kapasiteleri"
      />

      <DataToolbar
        search={search}
        onSearchChange={setSearch}
        onRefresh={() => list.refetch()}
        onCreate={() => setForm({ ...EMPTY })}
        createLabel="Yeni Makine"
        canCreate={can("IS_AKISI", "create")}
        count={total}
        onExport={exportCsv}
        exportBusy={exportBusy}
      />

      <ListSection>
        <DataTable
          columns={columns}
          data={list.data ?? []}
          loading={list.isLoading}
          filterable
          noDataText={tableEmptyText({
            isError: list.isError,
            filtered: Boolean(debouncedSearch),
            empty: 'Kayıtlı makine bulunamadı.',
          })}
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
            form.id ? `Makine Düzenle - ${form.code}` : "Yeni Makine Tanımı"
          }
          onClose={() => setForm(null)}
          onSave={() => {
            const { id, ...data } = form;
            save.mutate({ id, data }, { onSuccess: () => setForm(null) });
          }}
          saveDisabled={!valid}
          busy={save.isPending}
          size="md"
        >
          <Form layout="S1 M2 L2 XL2">
            <FormGroup headerText="Makine Bilgileri">
              <FormItem labelContent={<Label required>Makine Kodu</Label>}>
                <Input
                  value={form.code}
                  placeholder="MK-01"
                  onInput={(e) => update({ code: e.target.value })}
                />
              </FormItem>
              <FormItem labelContent={<Label required>Makine Adı</Label>}>
                <Input
                  value={form.name}
                  onInput={(e) => update({ name: e.target.value })}
                />
              </FormItem>
              <FormItem labelContent={<Label>Üretim Hattı</Label>}>
                <Input
                  value={form.line ?? ""}
                  placeholder="Hat 1"
                  onInput={(e) => update({ line: e.target.value })}
                />
              </FormItem>
              <FormItem labelContent={<Label>Kapasite (adet/saat)</Label>}>
                <Input
                  type="Number"
                  value={form.capacity === null ? "" : String(form.capacity)}
                  placeholder="Planlama hesabında kullanılır"
                  onInput={(e) =>
                    update({
                      capacity:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </FormItem>
              <FormItem labelContent={<Label>Konum</Label>}>
                <Input
                  value={form.location ?? ""}
                  onInput={(e) => update({ location: e.target.value })}
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
          titleText="Makineyi Sil"
          actions={["Sil", "Vazgeç"]}
          onClose={(action) => {
            if (action === "Sil") {
              remove.mutate(deleteTarget.id, {
                onSuccess: () => setDeleteTarget(null),
              });
            } else {
              setDeleteTarget(null);
            }
          }}
        >
          <strong>{deleteTarget.code}</strong> - {deleteTarget.name} makinesini
          silmek istediğinize emin misiniz? Proses şemalarında kullanılıyorsa
          silinemez.
        </MessageBox>
      )}
    </div>
  );
}
