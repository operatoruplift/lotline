import { useId } from 'react';
import { formatMarketChange, formatMarketPrice, type ChartPoint } from '@/lib/domain/markets';
import styles from './markets.module.css';

const WIDTH = 320;
const HEIGHT = 112;
const PAD = 6;

/** A single-axis closing-price line. Its text alternative states the range, the ends and the change. */
export function PriceChart({ points, rangeLabel }: { points: readonly ChartPoint[]; rangeLabel: string }) {
  const gradient = useId();
  if (points.length < 2) return null;
  const prices = points.map(point => point.c);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const first = points[0];
  const last = points[points.length - 1];
  const span = Math.max(1, last.t - first.t);
  const spread = max - min || max * 0.01 || 1;
  const x = (t: number) => PAD + ((t - first.t) / span) * (WIDTH - PAD * 2);
  const y = (c: number) => PAD + (1 - (c - min) / spread) * (HEIGHT - PAD * 2);
  const line = points.map((point, index) => `${index ? 'L' : 'M'}${x(point.t).toFixed(1)} ${y(point.c).toFixed(1)}`).join(' ');
  const area = `${line} L${x(last.t).toFixed(1)} ${HEIGHT} L${x(first.t).toFixed(1)} ${HEIGHT} Z`;
  const change = ((last.c - first.c) / first.c) * 100;
  const direction = change > 0.005 ? 'up' : change < -0.005 ? 'down' : 'flat';
  const summary = `Price over the ${rangeLabel}: from ${formatMarketPrice(first.c)} to ${formatMarketPrice(last.c)}, ${formatMarketChange(change)}. Low ${formatMarketPrice(min)}, high ${formatMarketPrice(max)}.`;
  return (
    <figure className={styles.chart} data-direction={direction}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={summary}>
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradient})`} />
        <path d={line} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption>
        <span>High {formatMarketPrice(max)}</span>
        <span>Low {formatMarketPrice(min)}</span>
      </figcaption>
    </figure>
  );
}
