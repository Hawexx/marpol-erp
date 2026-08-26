import { useEffect, useState } from 'react';

/**
 * Degeri belirtilen sure boyunca sabit kaldiktan sonra yansitir.
 *
 * Arama kutusu dogrudan sorgu anahtarina bagliydi; "kumas" yazmak bes ayri
 * istek tetikliyor, her biri de sunucudan tam liste cekiyordu.
 */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
