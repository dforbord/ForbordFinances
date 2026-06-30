import { MonthlyEntry } from "./MonthlyEntry";
import { Buckets } from "./Buckets";
import { MonthSwitch } from "./MonthSwitch";

export function LogEntries({
  month,
  setMonth,
}: {
  month: string;
  setMonth: (m: string) => void;
}) {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Log Entries</h1>
          <div className="subtle">Record income &amp; spending, then manage your buckets below</div>
        </div>
        <MonthSwitch month={month} setMonth={setMonth} />
      </div>

      <MonthlyEntry month={month} setMonth={setMonth} embedded />

      <div className="section">
        <h2 style={{ marginTop: 12 }}>Buckets</h2>
        <div className="subtle" style={{ marginTop: -6, marginBottom: 14 }}>
          Your customizable expense, tax, and savings categories
        </div>
        <Buckets embedded />
      </div>
    </>
  );
}
