import React, { useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import type { KainuIrašas, Medžiaga } from '../../lib/kainosService';

interface AddMaterialModalProps {
  initial?: Medžiaga;
  onSave: (artikulas: string, pavadinimas: string, vienetas: string) => Promise<void>;
  onClose: () => void;
}

export function AddMaterialModal({ initial, onSave, onClose }: AddMaterialModalProps) {
  const [artikulas, setArtikulas] = useState(initial?.artikulas ?? '');
  const [pavadinimas, setPavadinimas] = useState(initial?.pavadinimas ?? '');
  const [vienetas, setVienetas] = useState(initial?.vienetas ?? 'Eur/kg');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!artikulas.trim() || !pavadinimas.trim()) return;
    setSaving(true);
    try {
      await onSave(artikulas.trim(), pavadinimas.trim(), vienetas.trim() || 'Eur/kg');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md mx-4 bg-white rounded-2xl overflow-hidden"
        style={{ boxShadow: '0 25px 50px rgba(0,0,0,0.2)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #f0ede8' }}>
          <h3 className="text-sm font-semibold" style={{ color: '#3d3935' }}>
            {initial ? 'Redaguoti medžiagą' : 'Nauja medžiaga'}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-black/5">
            <X className="w-4 h-4" style={{ color: '#8a857f' }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: '#5a5550' }}>Artikulas (ID)</label>
            <input
              autoFocus={!initial}
              value={artikulas}
              onChange={e => setArtikulas(e.target.value)}
              disabled={!!initial}
              placeholder="pvz. DER-001"
              className="w-full px-3 py-2 text-sm rounded-lg outline-none disabled:opacity-60"
              style={{ background: '#fdfcfb', border: '1px solid #e5e0d8', color: '#3d3935' }}
            />
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: '#5a5550' }}>Pavadinimas</label>
            <input
              autoFocus={!!initial}
              value={pavadinimas}
              onChange={e => setPavadinimas(e.target.value)}
              placeholder="pvz. derva rankiniam f."
              className="w-full px-3 py-2 text-sm rounded-lg outline-none"
              style={{ background: '#fdfcfb', border: '1px solid #e5e0d8', color: '#3d3935' }}
            />
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: '#5a5550' }}>Vienetas</label>
            <input
              value={vienetas}
              onChange={e => setVienetas(e.target.value)}
              placeholder="Eur/kg"
              className="w-full px-3 py-2 text-sm rounded-lg outline-none"
              style={{ background: '#fdfcfb', border: '1px solid #e5e0d8', color: '#3d3935' }}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-1.5 text-xs rounded-lg" style={{ color: '#5a5550', background: 'rgba(0,0,0,0.04)' }}>
              Atšaukti
            </button>
            <button
              type="submit"
              disabled={saving || !artikulas.trim() || !pavadinimas.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg text-white disabled:opacity-60"
              style={{ background: '#007AFF' }}
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Išsaugoti
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface PriceModalProps {
  medziagas: Medžiaga[];
  initial?: KainuIrašas;
  defaultArtikulas?: string;
  defaultDate?: string;
  onSave: (artikulas: string, data: string, min: number | null, max: number | null, notes: string | null) => Promise<void>;
  onClose: () => void;
}

export function PriceModal({ medziagas, initial, defaultArtikulas, defaultDate, onSave, onClose }: PriceModalProps) {
  const [art, setArt] = useState<string>(
    initial?.artikulas ?? defaultArtikulas ?? (medziagas[0]?.artikulas ?? '')
  );
  const [data, setData] = useState(initial?.data ?? defaultDate ?? new Date().toISOString().split('T')[0]);
  const [isRange, setIsRange] = useState(
    !!(initial && initial.kaina_max !== null && initial.kaina_max !== initial.kaina_min)
  );
  const [kMin, setKMin] = useState(initial?.kaina_min != null ? String(initial.kaina_min) : '');
  const [kMax, setKMax] = useState(initial?.kaina_max != null ? String(initial.kaina_max) : '');
  const [notes, setNotes] = useState(initial?.pastabos ?? '');
  const [saving, setSaving] = useState(false);

  const quickMode = !!(defaultArtikulas && defaultDate && !initial);
  const matName = medziagas.find(m => m.artikulas === art)?.pavadinimas;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!art || !data) return;
    const min = kMin ? parseFloat(kMin) : null;
    const max = isRange && kMax ? parseFloat(kMax) : null;
    setSaving(true);
    try {
      await onSave(art, data, min, max, notes.trim() || null);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className={`w-full mx-4 bg-white rounded-2xl overflow-hidden ${quickMode ? 'max-w-sm' : 'max-w-md'}`}
        style={{ boxShadow: '0 25px 50px rgba(0,0,0,0.2)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #f0ede8' }}>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: '#3d3935' }}>
              {initial ? 'Redaguoti kainą' : quickMode ? 'Pridėti kainą' : 'Nauja kaina'}
            </h3>
            {quickMode && matName && <p className="text-xs mt-0.5" style={{ color: '#8a857f' }}>{matName} · {data}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-black/5">
            <X className="w-4 h-4" style={{ color: '#8a857f' }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          {!quickMode && (
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: '#5a5550' }}>Medžiaga</label>
              <select value={art} onChange={e => setArt(e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg outline-none" style={{ background: '#fdfcfb', border: '1px solid #e5e0d8', color: '#3d3935' }}>
                {medziagas.map(m => <option key={m.artikulas} value={m.artikulas}>{m.pavadinimas} ({m.artikulas})</option>)}
              </select>
            </div>
          )}

          {!quickMode && (
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: '#5a5550' }}>Data</label>
              <input type="date" value={data} onChange={e => setData(e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg outline-none" style={{ background: '#fdfcfb', border: '1px solid #e5e0d8', color: '#3d3935' }} />
            </div>
          )}

          <div className="flex gap-2">
            {(['exact', 'range'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setIsRange(t === 'range')}
                className="flex-1 py-1.5 text-xs rounded-lg font-medium transition-all"
                style={{
                  background: (isRange ? t === 'range' : t === 'exact') ? '#007AFF' : 'rgba(0,0,0,0.04)',
                  color: (isRange ? t === 'range' : t === 'exact') ? 'white' : '#5a5550',
                }}
              >
                {t === 'exact' ? 'Tiksli kaina' : 'Diapazonas'}
              </button>
            ))}
          </div>

          <div className={`grid gap-2 ${isRange ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: '#5a5550' }}>
                {isRange ? 'Nuo (Eur/kg)' : 'Kaina (Eur/kg)'}
              </label>
              <input type="number" step="0.01" value={kMin} onChange={e => setKMin(e.target.value)} placeholder="pvz. 2.50" className="w-full px-3 py-2 text-sm rounded-lg outline-none" style={{ background: '#fdfcfb', border: '1px solid #e5e0d8', color: '#3d3935' }} />
            </div>
            {isRange && (
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: '#5a5550' }}>Iki (Eur/kg)</label>
                <input type="number" step="0.01" value={kMax} onChange={e => setKMax(e.target.value)} placeholder="pvz. 2.81" className="w-full px-3 py-2 text-sm rounded-lg outline-none" style={{ background: '#fdfcfb', border: '1px solid #e5e0d8', color: '#3d3935' }} />
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: '#5a5550' }}>Pastabos</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="pvz. ???" className="w-full px-3 py-2 text-sm rounded-lg outline-none" style={{ background: '#fdfcfb', border: '1px solid #e5e0d8', color: '#3d3935' }} />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-1.5 text-xs rounded-lg" style={{ color: '#5a5550', background: 'rgba(0,0,0,0.04)' }}>
              Atšaukti
            </button>
            <button type="submit" disabled={saving || !art || !data} className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg text-white disabled:opacity-60" style={{ background: '#007AFF' }}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Išsaugoti
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
