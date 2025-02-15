import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import {
  update,
  MU_PRIOR,
  SIGMA_SQ_PRIOR,
  ALPHA_PRIOR,
  BETA_PRIOR,
} from "../algorithms/crowdBT";

const prisma = new PrismaClient();

export const getNextComparisonHandler = async (
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
      res
        .status(400)
        .json({ error: "Not enough choices to compute a comparison." });
      return;
    }
    const comparisons = decision.comparisons;

    // 2. Get required comparisons per pair.
    const requiredComparisonsPerPair = 1; // Fixed value since we only allow one vote per user
    const n = choices.length;
    // Total expected comparisons (for all distinct pairs).
    const totalComparisons = ((n * (n - 1)) / 2) * requiredComparisonsPerPair;
    // How many comparisons remain to be done in total.
    const comparisonsRemaining = totalComparisons - comparisons.length;

    // 3. Update candidate parameters using the Crowd‑BT algorithm.
    let globalAlpha = ALPHA_PRIOR;
    let globalBeta = BETA_PRIOR;
    const candidateParams: { [key: number]: { mu: number; sigmaSq: number } } =
      {};
    choices.forEach((choice) => {
      candidateParams[choice.id] = { mu: MU_PRIOR, sigmaSq: SIGMA_SQ_PRIOR };
    });

    const sortedComparisons = comparisons.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    for (const comp of sortedComparisons) {
      // Only process comparisons with a recorded winner.
      if (comp.winnerId === null) continue;
      const { choice1Id, choice2Id, winnerId } = comp;
      let winnerIdEffective: number, loserIdEffective: number;
      if (winnerId === choice1Id) {
        winnerIdEffective = choice1Id;
        loserIdEffective = choice2Id;
      } else {
        winnerIdEffective = choice2Id;
        loserIdEffective = choice1Id;
      }

      const winnerParams = candidateParams[winnerIdEffective];
      const loserParams = candidateParams[loserIdEffective];
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
      // Update candidate skill parameters.
      candidateParams[winnerIdEffective] = {
        mu: result.updatedMuWinner,
        sigmaSq: result.updatedSigmaSqWinner,
      };
      candidateParams[loserIdEffective] = {
        mu: result.updatedMuLoser,
        sigmaSq: result.updatedSigmaSqLoser,
      };
    }

    // 4. From all possible pairs, identify those that have been compared
    // fewer times than required, and choose the pair with the smallest absolute mu difference.
    let bestPair: {
      choice1: (typeof choices)[number];
      choice2: (typeof choices)[number];
    } | null = null;
    let bestDiff = Infinity;
    for (let i = 0; i < choices.length; i++) {
      for (let j = i + 1; j < choices.length; j++) {
        const id1 = choices[i].id;
        const id2 = choices[j].id;
        // Count the comparisons done for this pair (order doesn't matter).
        const pairCount = comparisons.filter(
          (comp) =>
            (comp.choice1Id === id1 && comp.choice2Id === id2) ||
            (comp.choice1Id === id2 && comp.choice2Id === id1)
        ).length;
        if (pairCount < requiredComparisonsPerPair) {
          const diff = Math.abs(
            candidateParams[id1].mu - candidateParams[id2].mu
          );
          if (diff < bestDiff) {
            bestDiff = diff;
            bestPair = { choice1: choices[i], choice2: choices[j] };
          }
        }
      }
    }

    // 5. If no eligible pair is found then all comparisons are complete.
    if (!bestPair) {
      res.status(200).json({
        // Even though a pair is required by the frontend, if no comparison remains
        // return a dummy pair (the frontend should then navigate away).
        choice1: { id: choices[0].id, text: choices[0].text },
        choice2: { id: choices[1].id, text: choices[1].text },
        comparisonsRemaining: 0,
        totalComparisons,
      });
      return;
    }

    res.status(200).json({
      choice1: { id: bestPair.choice1.id, text: bestPair.choice1.text },
      choice2: { id: bestPair.choice2.id, text: bestPair.choice2.text },
      comparisonsRemaining,
      totalComparisons,
    });
  } catch (error) {
    console.error(
      `${new Date().toISOString()} - getNextComparisonHandler - Error:`,
      error
    );
    res.status(500).json({ error: "Failed to retrieve next comparison" });
  }
};
