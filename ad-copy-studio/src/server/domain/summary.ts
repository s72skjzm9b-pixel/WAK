import type { Revision } from '../store/repo';

export function revisionSummary(r: Revision) {
  return {
    id: r.id, kind: r.kind, sourceId: r.sourceId, language: r.language, baseText: r.baseText, proposedText: r.proposedText,
    englishBasis: r.englishBasis, reason: r.reason, meta: r.meta, state: r.state, syncState: r.syncState, syncDetail: r.syncDetail,
    isTest: r.isTest, createdBy: r.createdBy, createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

