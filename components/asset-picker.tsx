'use client';

import { useState } from 'react';
import { Search, X } from 'lucide-react';
import type { Asset } from '@/lib/domain/types';
import styles from './asset-picker.module.css';

export function AssetPicker({ assets, onSelect, onClose }: { assets: Asset[]; onSelect: (mint: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const search = query.trim().toLowerCase();
  const filtered = assets.filter(asset => [asset.symbol, asset.name, asset.underlyingSymbol ?? '', asset.mint].some(value => value.toLowerCase().includes(search)));
  return <div className={styles.picker} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
    <div className={styles.heading}><strong>Find your next asset</strong><button type="button" className="icon-button" aria-label="Close asset picker" onClick={onClose}><X size={16} /></button></div>
    <label htmlFor="asset-search" className={styles.label}>Search stocks and ETFs</label>
    <div className={styles.search}><Search size={16} aria-hidden="true" /><input id="asset-search" type="search" autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Company name or ticker" autoComplete="off" /></div>
    <label htmlFor="asset-picker" className={styles.label}>Choose a verified xStock</label>
    <select id="asset-picker" value="" disabled={!filtered.length} onChange={event => { if (event.target.value) onSelect(event.target.value); }}>
      <option value="" disabled>{filtered.length ? 'Choose a verified xStock' : 'No matching stocks'}</option>
      {filtered.map(asset => <option value={asset.mint} key={asset.mint}>{asset.symbol} · {asset.name}{asset.halted ? ' · Issuer halt reported' : ''}</option>)}
    </select>
    <p role="status">{filtered.length ? `${filtered.length} ${filtered.length === 1 ? 'asset' : 'assets'} available${search ? ' matching your search' : ''}.` : 'No matches. Try a different company name or ticker.'}</p>
  </div>;
}
