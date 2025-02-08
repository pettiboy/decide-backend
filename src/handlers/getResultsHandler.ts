import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * GET /decisions/{decisionId}/results
 * Calculates the ranking of choices for a decision using a Schulze (Gavel-like) algorithm.
 */
export const getResultsHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { decisionId } = req.params;

  try {
    // 1. Fetch decision with its choices and comparisons.
    const decision = await prisma.decision.findUnique({
      where: { id: decisionId },
      include: {
        choices: true,
        comparisons: true,
      },
    });
    if (!decision) {
      res.status(404).json({ error: "Decision not found" });
      return;
    }
    const choices = decision.choices;
    if (!choices || choices.length < 2) {
      res.status(400).json({ error: "Not enough choices to compute ranking." });
      return;
    }
    const comparisons = decision.comparisons;

    // 2. Map each choice ID to an index.
    const candidateIds = choices.map((choice) => choice.id);
    const n = candidateIds.length;
    const idToIndex = new Map<number, number>();
    candidateIds.forEach((id, idx) => idToIndex.set(id, idx));

    // 3. Build the pairwise wins matrix d:
    // d[i][j] is the number of times candidate i beat candidate j.
    const d: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
    for (const comp of comparisons) {
      if (comp.winnerId !== null) {
        // Determine loserId: if winner is choice1Id then loser is choice2Id, else vice versa.
        const loserId =
          comp.winnerId === comp.choice1Id ? comp.choice2Id : comp.choice1Id;
        const i = idToIndex.get(comp.winnerId);
        const j = idToIndex.get(loserId);
        if (i === undefined || j === undefined) continue;
        d[i][j] += 1;
      }
    }

    // 4. Compute the strongest path matrix p using Schulze's algorithm.
    // Initialize p[i][j] = d[i][j] for all distinct i, j.
    const p: number[][] = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? 0 : d[i][j]))
    );

    // For every candidate k, update the p matrix.
    for (let k = 0; k < n; k++) {
      for (let i = 0; i < n; i++) {
        if (i === k) continue;
        for (let j = 0; j < n; j++) {
          if (j === k || i === j) continue;
          p[i][j] = Math.max(p[i][j], Math.min(p[i][k], p[k][j]));
        }
      }
    }

    // 5. Compute a score for each candidate:
    // Count for each candidate i how many candidates j (j != i) satisfy p[i][j] > p[j][i].
    const scores: number[] = Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j && p[i][j] > p[j][i]) {
          scores[i] += 1;
        }
      }
    }

    // 6. Combine choices with scores and sort them descending by score.
    // In case of ties, sort by candidate id (ascending).
    const results = choices.map((choice) => ({
      id: choice.id,
      text: choice.text, // adjust if your choice field is named differently
      score: scores[idToIndex.get(choice.id)!],
    }));

    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.id - b.id;
    });

    // 7. Assign ranks based on sorted order.
    let currentRank = 1;
    let lastScore: number | null = null;
    const rankedResults = results.map((result, idx) => {
      if (lastScore === null || result.score < lastScore) {
        currentRank = idx + 1;
      }
      lastScore = result.score;
      return { ...result, rank: currentRank };
    });

    console.info(
      `${new Date().toISOString()} - getResultsHandler - Calculated ranking for decision ${decisionId}:`,
      rankedResults
    );
    res.status(200).json({ rankedChoices: rankedResults });
  } catch (error) {
    console.error(
      `${new Date().toISOString()} - getResultsHandler - Error calculating results for decision ${decisionId}:`,
      error
    );
    res.status(500).json({ error: "Failed to calculate results" });
  }
};
