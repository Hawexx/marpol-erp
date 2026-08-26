import { Button, Text } from '@ui5/webcomponents-react';
import { formatNumber } from '../lib/format.js';

/** Liste sayfalarinin altindaki sayfa gezinme cubugu. */
export function Pagination({
  page,
  pageSize,
  total,
  busy,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  busy?: boolean;
  onChange: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="mp-pager">
      <Text>
        {total === 0
          ? 'Kayıt yok'
          : `${formatNumber(first)}-${formatNumber(last)} / ${formatNumber(total)} kayıt`}
      </Text>
      <div className="mp-pager__nav">
        <Button
          design="Transparent"
          icon="navigation-left-arrow"
          disabled={page <= 1 || busy}
          onClick={() => onChange(page - 1)}
        >
          Önceki
        </Button>
        <Text>
          Sayfa {page} / {pageCount}
        </Text>
        <Button
          design="Transparent"
          icon="navigation-right-arrow"
          disabled={page >= pageCount || busy}
          onClick={() => onChange(page + 1)}
        >
          Sonraki
        </Button>
      </div>
    </div>
  );
}
