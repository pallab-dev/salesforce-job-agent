"use client";

import { useMemo, useState } from "react";

type MultiSelectChipsProps = {
  label: string;
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  helperText?: string;
};

function normalize(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim().toLowerCase()).filter(Boolean)));
}

export default function MultiSelectChips({
  label,
  options,
  selected,
  onChange,
  placeholder,
  helperText
}: MultiSelectChipsProps) {
  const [query, setQuery] = useState("");

  const selectedNorm = useMemo(() => normalize(selected), [selected]);
  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options
      .map((v) => v.toLowerCase())
      .filter((opt) => !selectedNorm.includes(opt) && (!q || opt.includes(q)))
      .slice(0, 8);
  }, [options, query, selectedNorm]);

  function add(value: string) {
    const next = normalize([...selectedNorm, value]);
    onChange(next);
    setQuery("");
  }

  function remove(value: string) {
    onChange(selectedNorm.filter((item) => item !== value));
  }

  return (
    <label className="field">
      {label}
      <input
        className="input"
        value={query}
        placeholder={placeholder || "Type to search"}
        onChange={(e) => setQuery(e.target.value)}
      />
      {filteredOptions.length ? (
        <div className="chip-picker" role="listbox" aria-label={`${label} options`}>
          {filteredOptions.map((option) => (
            <button
              key={option}
              className="chip-option"
              type="button"
              onClick={() => add(option)}
            >
              + {option}
            </button>
          ))}
        </div>
      ) : null}
      <div className="chip-row">
        {selectedNorm.length ? (
          selectedNorm.map((value) => (
            <button key={value} type="button" className="selected-chip" onClick={() => remove(value)}>
              {value} ×
            </button>
          ))
        ) : (
          <span className="footnote">No selection yet.</span>
        )}
      </div>
      {helperText ? <span className="footnote">{helperText}</span> : null}
    </label>
  );
}
