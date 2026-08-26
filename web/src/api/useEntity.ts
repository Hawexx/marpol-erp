import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from './client.js';
import { useNotify } from '../components/NotificationProvider.js';

/** Sunucunun sayfali yanit zarfi. */
interface PageEnvelope<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

function isEnvelope<T>(value: unknown): value is PageEnvelope<T> {
  return typeof value === 'object' && value !== null && Array.isArray((value as PageEnvelope<T>).rows);
}

interface Options {
  search?: string;
  activeOnly?: boolean;
  enabled?: boolean;
  /**
   * Sayfa numarasi verilirse sunucudan sayfali yanit istenir. Verilmezse
   * eski davranis korunur ve tum kayitlar doner (acilir kutular boyle kullanir).
   */
  page?: number;
  pageSize?: number;
}

/**
 * Tanim karti sekmeleri icin ortak liste + kaydet + sil islemleri.
 * Basari/hata mesajlarini merkezi bildirim sistemine baglar.
 */
export function useEntity<T extends { id: string }>(path: string, options: Options = {}) {
  const queryClient = useQueryClient();
  const { toast, error: showError } = useNotify();
  const { search = '', activeOnly = false, enabled = true, page, pageSize = 50 } = options;

  const paginated = page !== undefined;

  const params = new URLSearchParams();
  if (search) params.set('q', search);
  if (activeOnly) params.set('active', 'true');
  if (paginated) {
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
  }
  const query = params.toString() ? `?${params}` : '';

  const list = useQuery({
    queryKey: [path, search, activeOnly, page ?? null, paginated ? pageSize : null],
    queryFn: async () => {
      const result = await api.get<T[] | PageEnvelope<T>>(`${path}${query}`);
      return isEnvelope<T>(result)
        ? result
        : { rows: result, total: result.length, page: 1, pageSize: result.length };
    },
    enabled,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [path] });

  const save = useMutation({
    mutationFn: ({ id, data }: { id?: string; data: unknown }) =>
      id ? api.put<T>(`${path}/${id}`, data) : api.post<T>(path, data),
    onSuccess: (_result, variables) => {
      toast(variables.id ? 'Kayıt güncellendi.' : 'Kayıt oluşturuldu.');
      invalidate();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete<{ message: string }>(`${path}/${id}`),
    onSuccess: (result) => {
      toast(result.message ?? 'Kayıt silindi.');
      invalidate();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  return {
    /**
     * Sayfalarin cogu `list.data`'yi dizi olarak kullanir; zarf burada
     * acilir ki cagri yerleri degismesin.
     */
    list: { ...list, data: list.data?.rows },
    total: list.data?.total ?? 0,
    save,
    remove,
    invalidate,
  };
}
