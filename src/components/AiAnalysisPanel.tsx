import { Loader2, Sparkles } from 'lucide-react';
import type { AiAnalysisResult } from '../types';

export function AiAnalysisPanel({
  loading,
  error,
  analysis,
  disabled,
  onClick
}: {
  loading: boolean;
  error: string | null;
  analysis: AiAnalysisResult | null;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <>
      <button className="button secondary full" disabled={loading || disabled} onClick={onClick} type="button">
        {loading ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
        Get AI analysis
      </button>
      {error ? <p className="error-text">{error}</p> : null}
      {analysis ? (
        <div className="ai-box">
          <p>{analysis.shortDescription}</p>
          <p>{analysis.riskExplanation}</p>
          <p>{analysis.recommendedAction}</p>
          <span>
            {analysis.cached ? 'Cached' : 'Fresh'} via {analysis.provider} {analysis.model}
          </span>
        </div>
      ) : null}
    </>
  );
}
