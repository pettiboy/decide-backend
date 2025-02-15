import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * GET /decisions/{decisionId}/results
 * Calculates the ranking of choices for a decision.
 * With incremental updates, candidate parameters (mu and sigmaSq) are stored on each Choice.
 */
export const getResultsHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { decisionId } = req.params;

  try {
    // 1. Fetch the decision with its choices (which now include stored mu and sigmaSq)
    //    and comparisons (to determine ranking completeness).
    const decision = await prisma.decision.findUnique({
      where: { id: decisionId },
      include: {
        choices: true,
        comparisons: {
          where: { winnerId: { not: null } },
        },
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

    // 2. Determine if the ranking is incomplete based on expected comparisons.
    const requiredComparisonsPerPair = 1; // one vote per user per pair
    const n = choices.length;
    const expectedComparisons =
      ((n * (n - 1)) / 2) * requiredComparisonsPerPair;
    const comparisons = decision.comparisons;
    const rankingIncomplete = comparisons.length < expectedComparisons;
    const comparisonsNeeded = rankingIncomplete
      ? expectedComparisons - comparisons.length
      : 0;

    // 3. Build ranking results using the stored candidate parameters.
    // Each choice already has an up-to-date mu and sigmaSq from incremental updates.
    const results = choices.map((choice) => ({
      id: choice.id,
      text: choice.text,
      score: choice.mu,
      sigmaSq: choice.sigmaSq,
      directWins: 0, // Placeholder for response consistency.
    }));

    // 4. Sort results by descending score (mu). In case of ties, lower sigmaSq wins.
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.sigmaSq !== b.sigmaSq) return a.sigmaSq - b.sigmaSq;
      return a.id - b.id;
    });

    // 5. Assign ranks (ties receive the same rank).
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
