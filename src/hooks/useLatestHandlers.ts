import { useLayoutEffect, useRef, useState } from 'react';

type Handler = (...args: never[]) => unknown;

/**
 * 把一组回调变成**引用稳定**、但调用时总是执行**最新一次提交**那版闭包的函数。
 *
 * 用途：给 `React.memo` 的子组件传事件回调（规则 advanced-event-handler-refs）。
 * 行为与直接写内联箭头函数一致（同样读到最新 state），区别只是引用不变，
 * 子组件不会因为父组件重渲染而被迫重渲染。
 *
 * ⚠️ 只适合"事件型"回调（点击 / 写参数 / 回传）。不要在子组件**渲染期**调用这些函数：
 *    最新闭包在 layout effect 里才换上，渲染期调用可能拿到上一版。
 */
export function useLatestHandlers<T extends Record<string, Handler>>(handlers: T): T {
  const latest = useRef(handlers);
  useLayoutEffect(() => { latest.current = handlers; });
  const [stable] = useState(() => {
    const out: Record<string, (...args: unknown[]) => unknown> = {};
    for (const key of Object.keys(handlers)) {
      out[key] = (...args: unknown[]) => (latest.current[key] as (...a: unknown[]) => unknown)(...args);
    }
    return out as unknown as T;
  });
  return stable;
}
