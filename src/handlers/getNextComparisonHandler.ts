import { Response } from "express";
import { PrismaClient } from "@prisma/client";
import {
  update,
  MU_PRIOR,
  SIGMA_SQ_PRIOR,
  ALPHA_PRIOR,
  BETA_PRIOR,
} from "../algorithms/crowdBT";
import { AuthenticatedRequest } from "../middleware/authMiddleware";

const prisma = new PrismaClient();

export const getNextComparisonHandler = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { decisionId } = req.params;
  const userId = req.user!.dbUser.id;

  try {
    // 1. Fetch the decision along with its choices and all comparisons
    const decision = await prisma.decision.findUnique({
      where: { id: decisionId },
      include: {
        choices: true,
        comparisons: {
          where: {
            OR: [
              { userId }, // Get user's own comparisons for filtering
              { winnerId: { not: null } }, // Get others' comparisons for scoring
            ],
          },
        },
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

    // Get pairs this user has already compared
    const userComparedPairs = new Set(
      comparisons
        .filter((comp) => comp.userId === userId)
        .map(
          (comp) =>
            `${Math.min(comp.choice1Id, comp.choice2Id)}-${Math.max(
              comp.choice1Id,
              comp.choice2Id
            )}`
        )
    );

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

    // Find eligible pairs, excluding those the user has already compared
    let bestPair: {
      choice1: (typeof choices)[number];
      choice2: (typeof choices)[number];
    } | null = null;
    let bestDiff = Infinity;

    for (let i = 0; i < choices.length; i++) {
      for (let j = i + 1; j < choices.length; j++) {
        const id1 = choices[i].id;
        const id2 = choices[j].id;
        const pairKey = `${Math.min(id1, id2)}-${Math.max(id1, id2)}`;

        // Skip if user has already compared this pair
        if (userComparedPairs.has(pairKey)) continue;

        const diff = Math.abs(
          candidateParams[id1].mu - candidateParams[id2].mu
        );
        if (diff < bestDiff) {
          bestDiff = diff;
          bestPair = { choice1: choices[i], choice2: choices[j] };
        }
      }
    }

    // If no eligible pair is found, all pairs have been compared by this user
    if (!bestPair) {
      res.status(200).json({
        choice1: null,
        choice2: null,
        comparisonsRemaining: 0,
        totalComparisons: comparisons.length,
      });
      return;
    }

    res.status(200).json({
      choice1: { id: bestPair.choice1.id, text: bestPair.choice1.text },
      choice2: { id: bestPair.choice2.id, text: bestPair.choice2.text },
      comparisonsRemaining:
        (choices.length * (choices.length - 1)) / 2 - userComparedPairs.size,
      totalComparisons: (choices.length * (choices.length - 1)) / 2,
    });
  } catch (error) {
    console.error(
      `${new Date().toISOString()} - getNextComparisonHandler - Error:`,
      error
    );
    res.status(500).json({ error: "Failed to retrieve next comparison" });
  }
};
