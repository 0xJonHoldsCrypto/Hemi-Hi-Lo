import React from 'react'


type Props = { value: number; onChange: (v:number)=>void }
export default function Slider({ value, onChange }: Props){
return (
<div className="card">
<label className="block mb-2 text-sm text-gray-400">Range (% of 0–100)</label>
<input type="range" min={1} max={100} value={value} onChange={e=>onChange(parseInt(e.target.value))} className="w-full"/>
<div className="mt-2 text-sm">Selected: <b>{value}%</b></div>
</div>
)
}