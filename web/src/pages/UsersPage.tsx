import { useEffect, useMemo, useState } from "react";
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
  Title,
} from "@ui5/webcomponents-react";
import { useEntity } from "../api/useEntity.js";
import { useAuth } from "../auth/AuthContext.js";
import { PageHeader, formatDateTime } from "../components/ui.js";
import { Pagination } from "../components/Pagination.js";
import { useDebounced } from "../lib/useDebounced.js";
import { DataToolbar } from "../components/DataToolbar.js";
import { columns as tableColumns } from "../components/table.js";
import { FormDialog } from "../components/FormDialog.js";
import { MODULES, MODULE_KEYS } from "../lib/modules.js";
import type { AppUser, ModuleKey, PermissionRow } from "../api/types.js";

const ACTION_COLUMNS: {
  key: keyof PermissionRow;
  label: string;
  hint: string;
}[] = [
  {
    key: "canView",
    label: "Görüntüle",
    hint: "Sekmeyi açabilir ve listeyi görebilir",
  },
  { key: "canCreate", label: "Ekle", hint: "Yeni kayıt oluşturabilir" },
  { key: "canEdit", label: "Düzenle", hint: "Mevcut kaydı değiştirebilir" },
  { key: "canDelete", label: "Sil", hint: "Kayıt silebilir" },
  { key: "canApprove", label: "Onayla", hint: "Üretim emri onaylayabilir" },
];

interface UserForm {
  id?: string;
  username: string;
  password: string;
  fullName: string;
  employeeNo: string;
  department: string;
  title: string;
  email: string;
  phone: string;
  isAdmin: boolean;
  isActive: boolean;
  permissions: PermissionRow[];
}

function emptyPermissions(): PermissionRow[] {
  return MODULE_KEYS.map((module) => ({
    module,
    canView: false,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canApprove: false,
  }));
}

const EMPTY: UserForm = {
  username: "",
  password: "",
  fullName: "",
  employeeNo: "",
  department: "",
  title: "",
  email: "",
  phone: "",
  isAdmin: false,
  isActive: true,
  permissions: emptyPermissions(),
};

const PAGE_SIZE = 50;

export default function UsersPage() {
  const { can, user: currentUser } = useAuth();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  // Her tus vurusunda sorgu atmamak icin arama gecikmeli uygulanir.
  const debouncedSearch = useDebounced(search, 300);
  const [form, setForm] = useState<UserForm | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);

  const { list, save, remove, total } = useEntity<AppUser>("/users", {
    search: debouncedSearch,
    page,
    pageSize: PAGE_SIZE,
  });

  // Arama degisince ilk sayfaya don; aksi halde bos sayfada kalinabilir.
  useEffect(() => setPage(1), [debouncedSearch]);

  const columns = useMemo(
    () =>
      tableColumns<AppUser>([
        { Header: "Sicil No", accessor: "employeeNo", width: 110 },
        { Header: "Ad Soyad", accessor: "fullName", minWidth: 200 },
        { Header: "Kullanıcı Adı", accessor: "username", width: 160 },
        { Header: "Departman", accessor: "department", width: 160 },
        { Header: "Ünvan", accessor: "title", width: 160 },
        {
          Header: "Rol",
          accessor: "isAdmin",
          width: 120,
          Cell: ({ value }: { value: boolean }) =>
            value ? (
              <ObjectStatus state="Information">Yönetici</ObjectStatus>
            ) : (
              <ObjectStatus state="None">Kullanıcı</ObjectStatus>
            ),
        },
        {
          Header: "Yetkili Sekme",
          id: "moduleCount",
          width: 140,
          disableFilters: true,
          hAlign: "End" as const,
          Cell: ({ row }: { row: { original: AppUser } }) =>
            row.original.isAdmin
              ? "Tümü"
              : `${row.original.permissions.filter((p) => p.canView).length} / ${MODULE_KEYS.length}`,
        },
        {
          Header: "Son Giriş",
          accessor: "lastLoginAt",
          width: 160,
          Cell: ({ value }: { value?: string }) => formatDateTime(value),
        },
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
          Header: "İşlem",
          id: "actions",
          width: 110,
          disableFilters: true,
          disableSortBy: true,
          Cell: ({ row }: { row: { original: AppUser } }) => (
            <div className="mp-inline-actions">
              {can("YETKILENDIRME", "edit") && (
                <Button
                  design="Transparent"
                  icon="edit"
                  tooltip="Düzenle"
                  onClick={() => setForm(toForm(row.original))}
                />
              )}
              {can("YETKILENDIRME", "delete") &&
                row.original.id !== currentUser?.id && (
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
    [can, currentUser?.id],
  );

  const update = (patch: Partial<UserForm>) =>
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));

  function togglePermission(
    module: ModuleKey,
    key: keyof PermissionRow,
    value: boolean,
  ) {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            permissions: prev.permissions.map((row) =>
              row.module === module
                ? {
                    ...row,
                    [key]: value,
                    // Ekle/düzenle/sil yetkisi verildiyse görüntüleme de açılır.
                    ...(value && key !== "canView" ? { canView: true } : {}),
                    // Görüntüleme kapatılırsa diğer yetkiler de kapanır.
                    ...(!value && key === "canView"
                      ? {
                          canCreate: false,
                          canEdit: false,
                          canDelete: false,
                          canApprove: false,
                        }
                      : {}),
                  }
                : row,
            ),
          }
        : prev,
    );
  }

  function toggleModuleAll(module: ModuleKey, value: boolean) {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            permissions: prev.permissions.map((row) =>
              row.module === module
                ? {
                    module,
                    canView: value,
                    canCreate: value,
                    canEdit: value,
                    canDelete: value,
                    canApprove: value,
                  }
                : row,
            ),
          }
        : prev,
    );
  }

  const isNew = !form?.id;

  return (
    <div className="mp-page">
      <PageHeader
        title="Yetkilendirme Paneli"
        subtitle="Personel hesapları ve sekme bazlı erişim yetkileri"
      />

      <DataToolbar
        search={search}
        onSearchChange={setSearch}
        onRefresh={() => list.refetch()}
        onCreate={() => setForm({ ...EMPTY, permissions: emptyPermissions() })}
        createLabel="Yeni Personel"
        canCreate={can("YETKILENDIRME", "create")}
        count={total}
      />

      <AnalyticalTable
        columns={columns}
        data={list.data ?? []}
        loading={list.isLoading}
        visibleRows={14}
        filterable
        noDataText={list.isError ? "Kayıtlar yüklenemedi." : "Kayıtlı personel bulunamadı."}
      />

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        busy={list.isFetching}
        onChange={setPage}
      />

      {form && (
        <FormDialog
          headerText={
            isNew
              ? "Yeni Personel ve Yetkileri"
              : `Personel Düzenle - ${form.fullName}`
          }
          onClose={() => setForm(null)}
          onSave={() => {
            const { id, password, ...rest } = form;
            save.mutate(
              {
                id,
                data: {
                  ...rest,
                  ...(password ? { password } : {}),
                  permissions: form.permissions,
                },
              },
              { onSuccess: () => setForm(null) },
            );
          }}
          saveDisabled={
            !form.fullName ||
            form.username.length < 3 ||
            (isNew && form.password.length < 8)
          }
          busy={save.isPending}
          width="min(900px, 90vw)"
        >
          <Form layout="S1 M2 L2 XL2">
            <FormGroup headerText="Personel Bilgileri">
              <FormItem labelContent={<Label required>Ad Soyad</Label>}>
                <Input
                  value={form.fullName}
                  onInput={(e) => update({ fullName: e.target.value })}
                />
              </FormItem>
              <FormItem labelContent={<Label>Sicil No</Label>}>
                <Input
                  value={form.employeeNo}
                  onInput={(e) => update({ employeeNo: e.target.value })}
                />
              </FormItem>
              <FormItem labelContent={<Label>Departman</Label>}>
                <Input
                  value={form.department}
                  onInput={(e) => update({ department: e.target.value })}
                  placeholder="Üretim / Kalite / Planlama"
                />
              </FormItem>
              <FormItem labelContent={<Label>Ünvan</Label>}>
                <Input
                  value={form.title}
                  onInput={(e) => update({ title: e.target.value })}
                />
              </FormItem>
              <FormItem labelContent={<Label>E-posta</Label>}>
                <Input
                  type="Email"
                  value={form.email}
                  onInput={(e) => update({ email: e.target.value })}
                />
              </FormItem>
              <FormItem labelContent={<Label>Telefon</Label>}>
                <Input
                  value={form.phone}
                  onInput={(e) => update({ phone: e.target.value })}
                />
              </FormItem>
            </FormGroup>

            <FormGroup headerText="Hesap Bilgileri">
              <FormItem labelContent={<Label required>Kullanıcı Adı</Label>}>
                <Input
                  value={form.username}
                  onInput={(e) => update({ username: e.target.value })}
                />
              </FormItem>
              <FormItem
                labelContent={
                  <Label required={isNew}>
                    {isNew ? "Şifre" : "Yeni Şifre"}
                  </Label>
                }
              >
                <Input
                  type="Password"
                  value={form.password}
                  placeholder={
                    isNew
                      ? "En az 8 karakter"
                      : "Değiştirmek istemiyorsanız boş bırakın"
                  }
                  onInput={(e) => update({ password: e.target.value })}
                />
              </FormItem>
              <FormItem labelContent={<Label>Hesap Durumu</Label>}>
                <CheckBox
                  text="Aktif"
                  checked={form.isActive}
                  onChange={(e) => update({ isActive: e.target.checked })}
                />
              </FormItem>
              <FormItem labelContent={<Label>Sistem Yöneticisi</Label>}>
                <CheckBox
                  text="Tüm sekmelere sınırsız erişim"
                  checked={form.isAdmin}
                  // Yonetici bayragini yalnizca yoneticiler degistirebilir;
                  // sunucu da ayni kurali uygular.
                  disabled={!currentUser?.isAdmin}
                  onChange={(e) => update({ isAdmin: e.target.checked })}
                />
              </FormItem>
            </FormGroup>
          </Form>

          <div style={{ marginTop: "1.25rem" }}>
            <Title level="H5">Sekme Yetkileri</Title>
            {form.isAdmin && (
              <MessageStrip
                design="Information"
                hideCloseButton
                style={{ margin: "0.5rem 0" }}
              >
                Sistem yöneticileri tüm sekmelere erişebilir; aşağıdaki matris
                devre dışıdır.
              </MessageStrip>
            )}

            <table className="mp-perm-table" style={{ marginTop: "0.5rem" }}>
              <caption className="mp-visually-hidden">
                Kullanıcının sekme bazlı yetkileri
              </caption>
              <thead>
                <tr>
                  <th scope="col" style={{ width: "30%" }}>
                    Sekme
                  </th>
                  {ACTION_COLUMNS.map((col) => (
                    <th scope="col" key={col.key} title={col.hint}>
                      {col.label}
                    </th>
                  ))}
                  <th scope="col" style={{ width: "10%" }}>
                    Tümü
                  </th>
                </tr>
              </thead>
              <tbody>
                {MODULES.map(({ key: module, label, hint }) => {
                  const row =
                    form.permissions.find((p) => p.module === module) ??
                    ({ module } as PermissionRow);
                  const all = ACTION_COLUMNS.every((col) => row[col.key]);
                  return (
                    <tr key={module}>
                      {/* Aciklama kayittan gelir; ayri bir sozluk tutulmaz. */}
                      <td title={hint}>{label}</td>
                      {ACTION_COLUMNS.map((col) => {
                        // Onaylama yalnizca uretim emri sekmelerinde anlamli.
                        const irrelevant =
                          col.key === "canApprove" &&
                          module !== "URETIM_EMIRLERI" &&
                          module !== "URETIM_EMRI_OLUSTUR";
                        return (
                          <td key={col.key}>
                            {irrelevant ? (
                              <span
                                style={{
                                  color: "var(--sapContent_LabelColor)",
                                }}
                              >
                                –
                              </span>
                            ) : (
                              <CheckBox
                                checked={Boolean(row[col.key])}
                                disabled={form.isAdmin}
                                onChange={(e) =>
                                  togglePermission(
                                    module,
                                    col.key,
                                    e.target.checked,
                                  )
                                }
                              />
                            )}
                          </td>
                        );
                      })}
                      <td>
                        <CheckBox
                          checked={all}
                          disabled={form.isAdmin}
                          onChange={(e) =>
                            toggleModuleAll(module, e.target.checked)
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </FormDialog>
      )}

      {deleteTarget && (
        <MessageBox
          open
          type="Warning"
          titleText="Personel Sil"
          actions={["Sil", "Vazgeç"]}
          onClose={(action) => {
            if (action === "Sil") remove.mutate(deleteTarget.id);
            setDeleteTarget(null);
          }}
        >
          <strong>{deleteTarget.fullName}</strong> ({deleteTarget.username})
          hesabını silmek istediğinize emin misiniz? Üretim emri kaydı olan
          personel silinmez, pasife alınır.
        </MessageBox>
      )}
    </div>
  );
}

function toForm(user: AppUser): UserForm {
  const permissions = MODULE_KEYS.map(
    (module) =>
      user.permissions.find((p) => p.module === module) ?? {
        module,
        canView: false,
        canCreate: false,
        canEdit: false,
        canDelete: false,
        canApprove: false,
      },
  );

  return {
    id: user.id,
    username: user.username,
    password: "",
    fullName: user.fullName,
    employeeNo: user.employeeNo ?? "",
    department: user.department ?? "",
    title: user.title ?? "",
    email: user.email ?? "",
    phone: user.phone ?? "",
    isAdmin: user.isAdmin,
    isActive: user.isActive,
    permissions,
  };
}
