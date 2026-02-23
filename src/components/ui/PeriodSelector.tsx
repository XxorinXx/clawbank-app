export type PeriodType = "daily" | "weekly" | "monthly";

export const PERIODS: { value: PeriodType; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

export function periodLabel(period: PeriodType): string {
  switch (period) {
    case "daily":
      return "day";
    case "weekly":
      return "week";
    case "monthly":
      return "month";
  }
}

interface PeriodSelectorProps {
  value: PeriodType;
  onChange: (period: PeriodType) => void;
  disabled?: boolean;
}

export function PeriodSelector({ value, onChange, disabled }: PeriodSelectorProps) {
  return (
    <>
      <label className="mb-2 mt-4 block text-sm font-medium text-gray-700">Period</label>
      <div className="flex gap-0 rounded-xl border border-gray-200 p-1">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            type="button"
            className={`flex-1 cursor-pointer rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              value === p.value
                ? "bg-black text-white"
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => onChange(p.value)}
            disabled={disabled}
          >
            {p.label}
          </button>
        ))}
      </div>
    </>
  );
}
