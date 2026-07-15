import { monthLabel, shiftMonth } from "../format";
import { monthKey } from "../storage";

export function MonthSwitch({
  month,
  setMonth,
}: {
  month: string;
  setMonth: (m: string) => void;
}) {
  const current = monthKey(new Date());
  return (
    <div className="month-switch">
      <button className="icon" onClick={() => setMonth(shiftMonth(month, -1))} title="Previous month">
        ‹
      </button>
      <span className="label">{monthLabel(month)}</span>
      <button className="icon" onClick={() => setMonth(shiftMonth(month, 1))} title="Next month">
        ›
      </button>
      {month !== current && (
        <button className="ghost small" onClick={() => setMonth(current)} title="Jump to the current month">
          This month
        </button>
      )}
    </div>
  );
}
