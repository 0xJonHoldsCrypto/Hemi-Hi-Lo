import React from 'react'

type Props = {
  min?: number
  max?: number
  low: number
  high: number
  onChange: (low: number, high: number) => void
}

export default function RangeSlider({
  min = 0,
  max = 9999,
  low,
  high,
  onChange,
}: Props) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v))

  const onLowChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = clamp(parseInt(e.target.value || '0', 10))
    onChange(Math.min(next, high), high)
  }

  const onHighChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = clamp(parseInt(e.target.value || '0', 10))
    onChange(low, Math.max(next, low))
  }

  const pct = (v: number) => ((v - min) * 100) / (max - min)
  const left = pct(low)
  const right = 100 - pct(high)

  return (
    <div className="range-wrap">
      <div className="range-track" />
      <div
        className="range-highlight"
        style={{ left: `${left}%`, right: `${right}%` }}
      />
      {/* lower thumb */}
      <input
        type="range"
        min={min}
        max={max}
        value={low}
        onChange={onLowChange}
        className="range-thumb"
        aria-label="Low bound"
      />
      {/* upper thumb */}
      <input
        type="range"
        min={min}
        max={max}
        value={high}
        onChange={onHighChange}
        className="range-thumb"
        aria-label="High bound"
      />
      <div className="flex justify-between text-xs text-gray-400 mt-2">
        <span>Low: <b>{low}</b></span>
        <span>High: <b>{high}</b></span>
      </div>
    </div>
  )
}
