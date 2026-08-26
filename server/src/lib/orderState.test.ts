import { describe, expect, it } from 'vitest';
import { OrderStatus, StepStatus } from '@prisma/client';
import {
  ACIK_DURUMLAR,
  ONAY_GEREKTIREN_DURUMLAR,
  STEP_TRANSITIONS,
  TRANSITIONS,
  canTransition,
  canTransitionStep,
} from './orderState.js';

describe('emir durum makinesi', () => {
  it('her durum icin tanim vardir', () => {
    for (const status of Object.values(OrderStatus)) {
      expect(TRANSITIONS[status]).toBeDefined();
    }
  });

  it('normal uretim akisini izin verir', () => {
    expect(canTransition(OrderStatus.TASLAK, OrderStatus.ONAY_BEKLIYOR)).toBe(true);
    expect(canTransition(OrderStatus.ONAY_BEKLIYOR, OrderStatus.PLANLANDI)).toBe(true);
    expect(canTransition(OrderStatus.PLANLANDI, OrderStatus.URETIMDE)).toBe(true);
    expect(canTransition(OrderStatus.URETIMDE, OrderStatus.TAMAMLANDI)).toBe(true);
  });

  it('onay adimini atlamayi engeller', () => {
    // Faz 1'de kapatilan bypass: taslaktan dogrudan planlamaya gecilemez.
    expect(canTransition(OrderStatus.TASLAK, OrderStatus.PLANLANDI)).toBe(false);
    expect(canTransition(OrderStatus.TASLAK, OrderStatus.TAMAMLANDI)).toBe(false);
    expect(canTransition(OrderStatus.ONAY_BEKLIYOR, OrderStatus.URETIMDE)).toBe(false);
  });

  it('terminal durumlardan cikisi engeller', () => {
    for (const to of Object.values(OrderStatus)) {
      expect(canTransition(OrderStatus.TAMAMLANDI, to)).toBe(false);
      expect(canTransition(OrderStatus.IPTAL, to)).toBe(false);
    }
  });

  it('kapanmamis her durumdan iptale gecilebilir', () => {
    for (const status of ACIK_DURUMLAR) {
      expect(canTransition(status, OrderStatus.IPTAL)).toBe(true);
    }
  });

  it('hicbir durum kendine gecemez', () => {
    for (const status of Object.values(OrderStatus)) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it('onay gerektiren gecisler tanimlidir', () => {
    expect(ONAY_GEREKTIREN_DURUMLAR.has(OrderStatus.PLANLANDI)).toBe(true);
    expect(ONAY_GEREKTIREN_DURUMLAR.has(OrderStatus.TAMAMLANDI)).toBe(true);
    expect(ONAY_GEREKTIREN_DURUMLAR.has(OrderStatus.IPTAL)).toBe(true);
    // Uretimi baslatmak onay degil, saha isi.
    expect(ONAY_GEREKTIREN_DURUMLAR.has(OrderStatus.URETIMDE)).toBe(false);
  });

  it('acik durumlar terminal olanlari icermez', () => {
    expect(ACIK_DURUMLAR).not.toContain(OrderStatus.TAMAMLANDI);
    expect(ACIK_DURUMLAR).not.toContain(OrderStatus.IPTAL);
    expect(ACIK_DURUMLAR).toContain(OrderStatus.URETIMDE);
    expect(ACIK_DURUMLAR).toHaveLength(Object.values(OrderStatus).length - 2);
  });
});

describe('adim durum makinesi', () => {
  it('her durum icin tanim vardir', () => {
    for (const status of Object.values(StepStatus)) {
      expect(STEP_TRANSITIONS[status]).toBeDefined();
    }
  });

  it('ileri yonlu hareketi kisitlamaz', () => {
    // "Baslat"a basmadan isi bitiren operator engellenmemeli.
    expect(canTransitionStep(StepStatus.BEKLIYOR, StepStatus.TAMAMLANDI)).toBe(true);
    expect(canTransitionStep(StepStatus.BEKLIYOR, StepStatus.BASLADI)).toBe(true);
    expect(canTransitionStep(StepStatus.BASLADI, StepStatus.TAMAMLANDI)).toBe(true);
  });

  it('tamamlanan adimin gecmisini gizleyecek geri donusu engeller', () => {
    expect(canTransitionStep(StepStatus.TAMAMLANDI, StepStatus.BEKLIYOR)).toBe(false);
  });

  it('tamamlanan adimin duzeltme icin yeniden acilmasina izin verir', () => {
    expect(canTransitionStep(StepStatus.TAMAMLANDI, StepStatus.BASLADI)).toBe(true);
  });

  it('ayni duruma gecisi (degisiklik yok) serbest birakir', () => {
    for (const status of Object.values(StepStatus)) {
      expect(canTransitionStep(status, status)).toBe(true);
    }
  });

  it('atlanan adim geri alinabilir', () => {
    expect(canTransitionStep(StepStatus.ATLANDI, StepStatus.BEKLIYOR)).toBe(true);
  });
});
