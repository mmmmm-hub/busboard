import type { KeyboardEvent } from 'react';

/**
 * クリックできる div を、キーボード(Tab・Enter・スペース)とスクリーンリーダーでも
 * 操作できるボタンとして扱うための属性。
 */
export function pressable(onActivate: () => void, label?: string) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': label,
    onClick: onActivate,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.target !== e.currentTarget) return; // 中のボタン等のキー操作は邪魔しない
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate();
      }
    },
  };
}
