import type { RiskLevel } from '../types';

export function RiskBadge({ level, label, score }: { level: RiskLevel; label: string; score: number }) {
  return (
    <div className={`risk-meter ${level}`}>
      <div>
        <span>{label}</span>
      </div>
      <strong>{score}/100</strong>
    </div>
  );
}
