import { useState } from "react";
import { useStore, uid } from "../store";
import { fmt } from "../format";
import { Bucket, BucketType } from "../types";

const COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981",
  "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6",
  "#eab308", "#22c55e", "#06b6d4", "#f97316",
];

const TYPES: { value: BucketType; label: string }[] = [
  { value: "expense", label: "Expense" },
  { value: "tax", label: "Tax" },
  { value: "savings", label: "Savings" },
];

// Each type has one consistent badge color, regardless of the bucket's own dot color.
const TYPE_COLORS: Record<BucketType, string> = {
  expense: "#6366f1", // indigo
  tax: "#f59e0b", // amber
  savings: "#10b981", // green
};

/** Click-a-color picker — far friendlier than a dropdown of hex codes. */
function ColorSwatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="swatches">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={`swatch${value === c ? " selected" : ""}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
          aria-label={`Use color ${c}`}
          title={c}
        />
      ))}
    </div>
  );
}

export function Buckets({ embedded }: { embedded?: boolean } = {}) {
  const { state, dispatch } = useStore();

  const [name, setName] = useState("");
  const [type, setType] = useState<BucketType>("expense");
  const [planned, setPlanned] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);

  function add() {
    if (!name.trim()) return;
    dispatch({
      type: "ADD_BUCKET",
      bucket: {
        id: uid(),
        name: name.trim(),
        type,
        planned: parseFloat(planned) || 0,
        color,
      },
    });
    setName("");
    setPlanned("");
    setColor(COLORS[(state.buckets.length + 1) % COLORS.length]);
  }

  return (
    <>
      {!embedded && (
        <div className="page-head">
          <div>
            <h1>Buckets</h1>
            <div className="subtle">Your customizable expense, tax, and savings categories</div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="row-form">
          <div className="field grow">
            <label>Name</label>
            <input
              placeholder="e.g. Dining Out"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
          </div>
          <div className="field type">
            <label>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as BucketType)}>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field amt">
            <label>Monthly plan</label>
            <input
              type="number"
              placeholder="0.00"
              value={planned}
              onChange={(e) => setPlanned(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
          </div>
          <div className="field">
            <label>Color</label>
            <ColorSwatches value={color} onChange={setColor} />
          </div>
          <button className="primary" onClick={add}>
            Add Bucket
          </button>
        </div>
        <div className="help">
          “Monthly plan” is your target for the month — savings buckets use it as a contribution
          goal. The Dashboard compares it to what you actually log.
        </div>
      </div>

      <div className="section">
        {state.buckets.length === 0 ? (
          <div className="empty">No buckets yet. Add your first one above.</div>
        ) : (
          <div className="card">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th className="num">Monthly plan</th>
                  <th className="actions"></th>
                </tr>
              </thead>
              <tbody>
                {state.buckets.map((b) =>
                  editingId === b.id ? (
                    <EditRow
                      key={b.id}
                      bucket={b}
                      onSave={(updated) => {
                        dispatch({ type: "UPDATE_BUCKET", bucket: updated });
                        setEditingId(null);
                      }}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <tr key={b.id}>
                      <td>
                        <span className="dot" style={{ background: TYPE_COLORS[b.type] }} />
                        {b.name}
                      </td>
                      <td>
                        <span
                          className="tag"
                          style={{
                            background: TYPE_COLORS[b.type] + "22",
                            color: TYPE_COLORS[b.type],
                          }}
                        >
                          {b.type}
                        </span>
                      </td>
                      <td className="num">{fmt(b.planned)}</td>
                      <td className="actions">
                        <button className="small" onClick={() => setEditingId(b.id)}>
                          Edit
                        </button>{" "}
                        <button
                          className="danger small"
                          onClick={() => {
                            if (
                              confirm(
                                `Delete “${b.name}”? This also removes its logged entries from every month.`,
                              )
                            ) {
                              dispatch({ type: "DELETE_BUCKET", id: b.id });
                            }
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function EditRow({
  bucket,
  onSave,
  onCancel,
}: {
  bucket: Bucket;
  onSave: (b: Bucket) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(bucket.name);
  const [type, setType] = useState<BucketType>(bucket.type);
  const [planned, setPlanned] = useState(String(bucket.planned));
  const [color, setColor] = useState(bucket.color);

  return (
    <tr>
      <td>
        <div className="inline-edit">
          <span className="dot" style={{ background: color }} />
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <ColorSwatches value={color} onChange={setColor} />
      </td>
      <td>
        <select value={type} onChange={(e) => setType(e.target.value as BucketType)}>
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </td>
      <td className="num">
        <input
          type="number"
          value={planned}
          onChange={(e) => setPlanned(e.target.value)}
          style={{ width: 110 }}
        />
      </td>
      <td className="actions">
        <button
          className="primary small"
          onClick={() =>
            onSave({ ...bucket, name: name.trim() || bucket.name, type, planned: parseFloat(planned) || 0, color })
          }
        >
          Save
        </button>{" "}
        <button className="small ghost" onClick={onCancel}>
          Cancel
        </button>
      </td>
    </tr>
  );
}
