import recorded from "./recorded-proof.json";

/**
 * The recorded TxODDS World Cup stat-validation proof — the EXACT shape `settle`
 * hands to `txoracle::validate_stat`. It is public control-plane data (Merkle
 * hashes + a committed summary), not a user payload. The Settlement view
 * visualises this as the 3-stage pipeline that folds a single fixture stat up
 * into TxODDS's on-chain daily root.
 */
export interface ProofNode {
  hash: number[];
  isRightSibling: boolean;
}

export interface ScoreStat {
  key: number;
  value: number;
  period: number;
}

export interface RecordedProof {
  ts: number;
  statToProve: ScoreStat;
  eventStatRoot: number[];
  summary: {
    fixtureId: number;
    updateStats: {
      updateCount: number;
      minTimestamp: number;
      maxTimestamp: number;
    };
    eventStatsSubTreeRoot: number[];
  };
  statProof: ProofNode[];
  subTreeProof: ProofNode[];
  mainTreeProof: ProofNode[];
}

interface RecordedDoc {
  query: { fixtureId: number; seq: number; statKey: number };
  proof: RecordedProof;
}

const DOC = recorded as unknown as RecordedDoc;
export const RECORDED_PROOF: RecordedProof = DOC.proof;
export const RECORDED_QUERY = DOC.query;

const EPOCH_DAY_MS = 86_400_000;

/** The epoch-day the on-chain `daily_scores_roots` PDA is seeded by (mirrors the
 * backend's `daily_scores_roots_pda`). Shown to make the on-chain root concrete. */
export const DAILY_ROOT_EPOCH_DAY = Math.floor(
  RECORDED_PROOF.summary.updateStats.minTimestamp / EPOCH_DAY_MS,
);

// ── hex helpers ──────────────────────────────────────────────────────────────
export function toHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function shortHex(bytes: number[], head = 6, tail = 6): string {
  const h = toHex(bytes);
  return `${h.slice(0, head)}…${h.slice(-tail)}`;
}

// ── the 3-stage pipeline for the Merkle-proof viewer ──────────────────────────
export interface MerkleStage {
  id: string;
  index: number;
  title: string;
  subtitle: string;
  nodes: ProofNode[];
  outputLabel: string;
  outputRoot: number[] | null; // null => the root lives on-chain (not in the proof)
  onChainOutput: boolean;
}

export function merkleStages(proof: RecordedProof = RECORDED_PROOF): MerkleStage[] {
  return [
    {
      id: "stat",
      index: 1,
      title: "Stat proof",
      subtitle: "the fixture stat leaf → its event stat root",
      nodes: proof.statProof,
      outputLabel: "Event stat root",
      outputRoot: proof.eventStatRoot,
      onChainOutput: false,
    },
    {
      id: "subtree",
      index: 2,
      title: "Sub-tree proof",
      subtitle: "event stat root → the fixture's events sub-tree root",
      nodes: proof.subTreeProof,
      outputLabel: "Events sub-tree root (in the on-chain summary)",
      outputRoot: proof.summary.eventStatsSubTreeRoot,
      onChainOutput: false,
    },
    {
      id: "maintree",
      index: 3,
      title: "Main-tree proof",
      subtitle: "sub-tree root → TxODDS's committed daily root",
      nodes: proof.mainTreeProof,
      outputLabel: "TxODDS daily root",
      outputRoot: null,
      onChainOutput: true,
    },
  ];
}

export function totalProofNodes(proof: RecordedProof = RECORDED_PROOF): number {
  return (
    proof.statProof.length + proof.subTreeProof.length + proof.mainTreeProof.length
  );
}
