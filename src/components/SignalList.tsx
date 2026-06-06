import type { SafetySignal } from '../types';

export function SignalList({ signals }: { signals: SafetySignal[] }) {
  return (
    <ul className="signals">
      {signals.map((signal) => (
        <li className={signal.severity} key={signal.key}>
          {signal.label}
        </li>
      ))}
    </ul>
  );
}
