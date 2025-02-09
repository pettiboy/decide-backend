import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { update, MU_PRIOR, SIGMA_SQ_PRIOR, ALPHA_PRIOR, BETA_PRIOR } from "../algorithms/crowdBT";

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

    // 2. Determine total expected comparisons and progress.
    const requiredComparisonsPerPair = decision.requiredComparisonsPerPair || 1;
    const n = choices.length;
    const expectedComparisons =
      ((n * (n - 1)) / 2) * requiredComparisonsPerPair;
    const rankingIncomplete = comparisons.length < expectedComparisons;
    const comparisonsNeeded = rankingIncomplete
      ? expectedComparisons - comparisons.length
      : 0;

    // 3. Initialize candidate parameters using Crowd‑BT priors.
    let globalAlpha = ALPHA_PRIOR;
    let globalBeta = BETA_PRIOR;
    const candidateParams: { [key: number]: { mu: number; sigmaSq: number } } = {};
    choices.forEach((choice) => {
      candidateParams[choice.id] = { mu: MU_PRIOR, sigmaSq: SIGMA_SQ_PRIOR };
    });

    // 4. Process all comparisons (sorted by creation date) to update candidates.
    const sortedComparisons = comparisons.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    for (const comp of sortedComparisons) {
      // Only process comparisons with a recorded winner.
      if (comp.winnerId === null) continue;
      const { choice1Id, choice2Id, winnerId } = comp;
      let winnerEffective: number, loserEffective: number;
      if (winnerId === choice1Id) {
        winnerEffective = choice1Id;
        loserEffective = choice2Id;
      } else {
        winnerEffective = choice2Id;
        loserEffective = choice1Id;
      }

      const winnerParams = candidateParams[winnerEffective];
      const loserParams = candidateParams[loserEffective];
      const result = update(
        globalAlpha,
        globalBeta,
        winnerParams.mu,
        winnerParams.sigmaSq,
        loserParams.mu,
        loserParams.sigmaSq
      );
      // Update global annotator parameters.
      globalAlpha = result.updatedAlpha;
      globalBeta = result.updatedBeta;
      // Update candidate parameters.
      candidateParams[winnerEffective] = {
        mu: result.updatedMuWinner,
        sigmaSq: result.updatedSigmaSqWinner,
      };
      candidateParams[loserEffective] = {
        mu: result.updatedMuLoser,
        sigmaSq: result.updatedSigmaSqLoser,
      };
    }

    // 5. Build ranking results using updated params.
    const results = choices.map((choice) => ({
      id: choice.id,
      text: choice.text,
      score: candidateParams[choice.id].mu,
      directWins: 0, // Not computed with Crowd‑BT; kept for response format consistency.
    }));

    // Sort candidates by descending score (μ). In the event of a tie, lower variance wins.
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const sigmaA = candidateParams[a.id].sigmaSq;
      const sigmaB = candidateParams[b.id].sigmaSq;
      if (sigmaA !== sigmaB) return sigmaA - sigmaB;
      if (typeof a.id === "number" && typeof b.id === "number") {
        return a.id - b.id;
      }
      return a.id.toString().localeCompare(b.id.toString());
    });

    // 6. Assign ranks (ties receive the same rank).
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
