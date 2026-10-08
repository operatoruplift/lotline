'use client';

import { useState } from 'react';
import { EyeOff } from 'lucide-react';
import { hideAuthorOnDevice, showAuthorOnDevice } from '@/lib/client/hidden-authors';
import type { GalleryPlan } from '@/lib/domain/gallery';
import type { HiddenAuthor } from '@/lib/domain/hidden-authors';
import styles from './gallery.module.css';

/** Hide every plan from this plan's author on this device. Nothing is sent anywhere. */
export function HideAuthor({ plan, onHidden }: { plan: Pick<GalleryPlan, 'author_key' | 'display_name'>; onHidden?: () => void }) {
  const [blocked, setBlocked] = useState(false);
  const key = plan.author_key;
  if (!key) return null;
  return <>
    <button type="button" className={styles.quietAction} onClick={() => { const saved = hideAuthorOnDevice({ author_key: key, display_name: plan.display_name }); setBlocked(!saved); if (saved) onHidden?.(); }}><EyeOff size={14} aria-hidden="true" />Hide plans from this author</button>
    {blocked && <p className={styles.reportError} role="alert">This browser would not save that choice. Allow site storage, then try again.</p>}
  </>;
}

/** The authors hidden on this device, each with a way back. */
export function HiddenAuthorsList({ authors }: { authors: readonly HiddenAuthor[] | null }) {
  if (!authors?.length) return null;
  return <details className={styles.hiddenAuthors}>
    <summary>{authors.length === 1 ? '1 author hidden on this device' : `${authors.length} authors hidden on this device`}</summary>
    <ul>{authors.map(author => { const name = author.name ?? 'a Lotline member'; return <li key={author.key}>
      <span>{author.name ?? 'A Lotline member'}</span>
      <button type="button" className={styles.quietAction} aria-label={`Show plans from ${name}`} onClick={() => showAuthorOnDevice(author.key)}>Show their plans</button>
    </li>; })}</ul>
  </details>;
}
