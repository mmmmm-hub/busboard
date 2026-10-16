interface SegmentedToggleOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedToggleProps<T extends string> {
  options: SegmentedToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

// iOSのセグメントコントロールのように、選択インジケーターがスッとスライドするトグル(2択以上)。
export default function SegmentedToggle<T extends string>({ options, value, onChange }: SegmentedToggleProps<T>) {
  const n = options.length;
  const activeIndex = Math.max(0, options.findIndex((o) => o.value === value));

  return (
    <div role="group" className="relative bg-slate-100 p-1 rounded-2xl grid gap-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
      <div
        aria-hidden
        className="absolute inset-y-1 left-1 bg-white rounded-xl shadow-sm transition-transform duration-200 ease-out"
        style={{
          width: `calc((100% - ${(n + 1) * 4}px) / ${n} + 0px)`,
          transform: `translateX(calc(${activeIndex} * (100% + 4px)))`,
        }}
      />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={option.value === value}
          className={`relative z-10 min-h-11 py-2 px-3 text-sm rounded-xl text-center font-medium transition-colors duration-150 cursor-pointer ${
            option.value === value ? 'text-orange-700' : 'text-slate-600'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
