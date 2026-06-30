import { monthLabel, shiftMonth } from "../format";

export function MonthSwitch({
  month,
  setMonth,
}: {
  month: string;
  setMonth: (m: string) => void;
}) {
  return (
    <div className="month-switch">
      <button className="icon" onClick={() => setMonth(shiftMonth(month, -1))} title="Previous month">
        ‹
      </button>
      <span className="label">{monthLabel(month)}</span>
      <button className="icon" onClick={() => setMonth(shiftMonth(month, 1))} title="Next month">
        ›
      </button>
    </div>
  );
}
