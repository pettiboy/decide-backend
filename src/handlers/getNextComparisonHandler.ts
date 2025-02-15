import { Response } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthenticatedRequest } from "../middleware/authMiddleware";

const prisma = new PrismaClient();

// Helper to generate a unique pair key.
const getPairKey = (id1: number, id2: number): string =>
  `${Math.min(id1, id2)}-${Math.max(id1, id2)}`;

export const getNextComparisonHandler = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { decisionId } = req.params;
  const userId = req.user!.dbUser.id;

  try {
    // Fetch the decision (with choices that now include stored mu/sigmaSq)
    // and the comparisons already made by this user.
    const [decision, userComparisons] = await Promise.all([
      prisma.decision.findUnique({
        where: { id: decisionId },
        include: {
          choices: true,
        },
      }),
      prisma.comparison.findMany({
        where: {
          decisionId,
          userId,
        },
        select: {
          choice1Id: true,
          choice2Id: true,
        },
      }),
    ]);

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

    // Build a set of keys representing pairs this user has already compared.
    const userComparedPairs = new Set(
      userComparisons.map((comp) => getPairKey(comp.choice1Id, comp.choice2Id))
    );

    // Identify the eligible pair with the smallest difference in mu.
    let bestPair: {
      choice1: (typeof choices)[number];
      choice2: (typeof choices)[number];
    } | null = null;
    let bestDiff = Infinity;

    for (let i = 0; i < choices.length; i++) {
      for (let j = i + 1; j < choices.length; j++) {
        const id1 = choices[i].id;
        const id2 = choices[j].id;
        const pairKey = getPairKey(id1, id2);

        // Skip if this pair has already been compared by the user.
        if (userComparedPairs.has(pairKey)) continue;

        const diff = Math.abs(choices[i].mu - choices[j].mu);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestPair = { choice1: choices[i], choice2: choices[j] };
        }
      }
    }

    // Calculate totals for informational purposes.
    const totalComparisons = (choices.length * (choices.length - 1)) / 2;
    const comparisonsRemaining = totalComparisons - userComparedPairs.size;

    if (!bestPair) {
      res.status(200).json({
        choice1: null,
        choice2: null,
        comparisonsRemaining,
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
