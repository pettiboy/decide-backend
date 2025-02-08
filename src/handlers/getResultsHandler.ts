import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * GET /decisions/{decisionId}/results
 * Calculates the ranking of choices for a decision using a Schulze (Gavel-like) algorithm.
 * Uses the decision's stored requiredComparisonsPerPair field (if any) to optionally mark the ranking as incomplete.
 */
export const getResultsHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { decisionId } = req.params;

  try {
    // 1. Fetch the decision along with its choices and comparisons.
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

    // Use the decision's requiredComparisonsPerPair (default to 1 if missing)
    const requiredComparisonsPerPair = decision.requiredComparisonsPerPair || 1;
    const n = choices.length;
    // Expected total comparisons for complete data:
    const expectedComparisons =
      ((n * (n - 1)) / 2) * requiredComparisonsPerPair;
    const rankingIncomplete = comparisons.length < expectedComparisons;
    const comparisonsNeeded = rankingIncomplete
      ? expectedComparisons - comparisons.length
      : 0;

    // 2. Map each choice ID to an index.
    const candidateIds = choices.map((choice) => choice.id);
    const totalChoices = candidateIds.length;
    const idToIndex = new Map<number, number>();
    candidateIds.forEach((id, idx) => idToIndex.set(id, idx));

    // 3. Build the pairwise wins matrix d.
    // d[i][j] is the number of times candidate i beat candidate j.
    const d: number[][] = Array.from({ length: totalChoices }, () =>
      Array(totalChoices).fill(0)
    );
    for (const comp of comparisons) {
      if (comp.winnerId !== null) {
        // Determine loserId:
        // If winnerId equals choice1Id then loser is choice2Id; otherwise, loser is choice1Id.
        const loserId =
          comp.winnerId === comp.choice1Id ? comp.choice2Id : comp.choice1Id;
        const i = idToIndex.get(comp.winnerId);
        const j = idToIndex.get(loserId);
        if (i === undefined || j === undefined) continue;
        d[i][j] += 1;
      }
    }

    // Also compute directWins as a secondary ranking metric.
    const directWins = Array(totalChoices).fill(0);
    for (let i = 0; i < totalChoices; i++) {
      for (let j = 0; j < totalChoices; j++) {
        if (i !== j) {
          directWins[i] += d[i][j];
        }
      }
    }

    // 4. Compute the strongest path matrix p using Schulze's algorithm.
    const p: number[][] = Array.from({ length: totalChoices }, (_, i) =>
      Array.from({ length: totalChoices }, (_, j) => (i === j ? 0 : d[i][j]))
    );
    for (let k = 0; k < totalChoices; k++) {
      for (let i = 0; i < totalChoices; i++) {
        if (i === k) continue;
        for (let j = 0; j < totalChoices; j++) {
          if (j === k || i === j) continue;
          p[i][j] = Math.max(p[i][j], Math.min(p[i][k], p[k][j]));
        }
      }
    }

    // 5. Compute a score for each candidate.
    // The score is the count of other candidates j for which p[i][j] > p[j][i].
    const scores: number[] = Array(totalChoices).fill(0);
    for (let i = 0; i < totalChoices; i++) {
      for (let j = 0; j < totalChoices; j++) {
        if (i !== j && p[i][j] > p[j][i]) {
          scores[i] += 1;
        }
      }
    }

    // 6. Combine choices with scores and direct wins.
    const results = choices.map((choice) => ({
      id: choice.id,
      text: choice.text, // adjust if your choice field is named differently
      score: scores[idToIndex.get(choice.id)!],
      directWins: directWins[idToIndex.get(choice.id)!],
    }));

    // 7. Sort results by primary score, then by direct wins as tie-breaker, then by id.
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.directWins !== a.directWins) return b.directWins - a.directWins;
      if (typeof a.id === "number" && typeof b.id === "number") {
        return a.id - b.id;
      }
      return a.id.toString().localeCompare(b.id.toString());
    });

    // 8. Assign ranks based on sorted order (ties receive the same rank).
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
    res.status(200).json({
      rankedChoices: rankedResults,
      rankingIncomplete,
      comparisonsNeeded,
    });
  } catch (error) {
    console.error(
      `${new Date().toISOString()} - getResultsHandler - Error calculating results for decision ${decisionId}:`,
      error
    );
    res.status(500).json({ error: "Failed to calculate results" });
  }
};
