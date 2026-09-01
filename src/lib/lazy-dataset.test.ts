import { describe, expect, it, vi } from 'vitest';
import { createLazyDataset } from './lazy-dataset';

describe('createLazyDataset', () => {
  it('한 번만 불러오고 그다음은 캐시를 준다', async () => {
    const importer = vi.fn(async () => ({ default: { a: 1 } }));
    const ds = createLazyDataset<{ a: number }>(importer);
    expect(await ds.load()).toEqual({ a: 1 });
    expect(await ds.load()).toEqual({ a: 1 });
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('default 로 감싸지 않은 모듈도 읽는다', async () => {
    const ds = createLazyDataset<{ a: number }>(async () => ({ a: 2 }));
    expect(await ds.load()).toEqual({ a: 2 });
  });

  it('동시에 여러 번 불러도 한 번만 간다', async () => {
    const importer = vi.fn(async () => ({ default: { a: 1 } }));
    const ds = createLazyDataset<{ a: number }>(importer);
    await Promise.all([ds.load(), ds.load(), ds.load()]);
    expect(importer).toHaveBeenCalledTimes(1);
  });

  /**
   * 실패한 약속을 들고 있으면 그 세션 내내 다시 시도하지 않는다. 화면은
   * "아직 불러오는 중" 과 똑같아 보이는데 영원히 그 상태다 — 배포 직후 해시가
   * 바뀐 청크를 한 번 놓치는 것만으로 그렇게 된다.
   */
  it('실패하면 다음에 다시 시도한다', async () => {
    let calls = 0;
    const ds = createLazyDataset<{ a: number }>(async () => {
      calls++;
      if (calls === 1) throw new Error('network');
      return { default: { a: 9 } };
    });
    expect(await ds.load()).toBeNull();
    expect(await ds.load()).toEqual({ a: 9 });
    expect(calls).toBe(2);
  });

  it('실패가 이어지면 계속 다시 시도한다', async () => {
    let calls = 0;
    const ds = createLazyDataset(async () => {
      calls++;
      throw new Error('down');
    });
    await ds.load();
    await ds.load();
    await ds.load();
    expect(calls).toBe(3);
  });

  it('성공한 뒤에는 더 부르지 않는다', async () => {
    let calls = 0;
    const ds = createLazyDataset<{ a: number }>(async () => {
      calls++;
      if (calls === 1) throw new Error('once');
      return { default: { a: 1 } };
    });
    await ds.load();
    await ds.load();
    await ds.load();
    expect(calls).toBe(2);
  });
});
