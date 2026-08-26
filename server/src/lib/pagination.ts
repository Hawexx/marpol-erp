import type { Request } from 'express';
import { badRequest } from './http.js';

/** Sayfalama istenmediginde tek seferde donulecek en fazla kayit. */
const HARD_LIMIT = 1000;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;

export interface PageParams {
  /** Istemci sayfalama istedi mi? Istemediyse duz dizi donulur. */
  paginated: boolean;
  skip: number;
  take: number;
  page: number;
  pageSize: number;
}

/**
 * `?page=` veya `?pageSize=` gonderildiginde sayfalama devreye girer.
 *
 * Sayfalama parametresi olmayan istekler eski davranisi korur (duz dizi),
 * ancak yine de HARD_LIMIT ile sinirlanir: onceden hicbir uc `take`
 * kullanmadigindan tablolar buyudukce yanit boyutu sinirsiz artiyordu.
 */
export function readPageParams(req: Request): PageParams {
  const rawPage = req.query.page;
  const rawSize = req.query.pageSize;
  const paginated = rawPage !== undefined || rawSize !== undefined;

  if (!paginated) {
    return { paginated: false, skip: 0, take: HARD_LIMIT, page: 1, pageSize: HARD_LIMIT };
  }

  const page = Number(rawPage ?? 1);
  const pageSize = Number(rawSize ?? DEFAULT_PAGE_SIZE);

  if (!Number.isInteger(page) || page < 1) {
    throw badRequest('"page" 1 veya daha buyuk bir tam sayi olmalidir.');
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw badRequest(`"pageSize" 1-${MAX_PAGE_SIZE} arasinda bir tam sayi olmalidir.`);
  }

  return { paginated: true, skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

/** Sayfali yanit zarfi. Sayfalama istenmediyse duz dizi doner. */
export function pageResponse<T>(rows: T[], total: number, params: PageParams) {
  if (!params.paginated) return rows;
  return { rows, total, page: params.page, pageSize: params.pageSize };
}
