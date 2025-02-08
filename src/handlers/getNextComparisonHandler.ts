import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const getNextComparisonHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  const decisionId = req.params.decisionId;

  if (!decisionId) {
    res.status(400).json({ error: "Decision ID is required in the path." });
    return;
  }

  try {
    const decision = await prisma.decision.findUnique({
      where: { id: decisionId },
      include: { choices: true, comparisons: true },
    });

    if (!decision) {
      res.status(404).json({ error: "Decision not found." });
      return;
    }

    const choices = decision.choices;
    if (choices.length < 2) {
      res.status(204).send(); // No comparison possible if less than 2 choices
      return;
    }

    const existingComparisons = decision.comparisons.map((comp) => {
      return [
        Math.min(comp.choice1Id, comp.choice2Id),
        Math.max(comp.choice1Id, comp.choice2Id),
      ];
    });

    const choicePairs: [number, number][] = [];
    for (let i = 0; i < choices.length; i++) {
      for (let j = i + 1; j < choices.length; j++) {
        choicePairs.push([choices[i].id, choices[j].id]);
      }
    }

    const totalComparisonsPossible = choicePairs.length; // Calculate total possible comparisons
    const completedComparisonsCount = existingComparisons.length; // Count completed comparisons
    const remainingComparisonsCount =
      totalComparisonsPossible - completedComparisonsCount; // Calculate remaining

    let nextComparisonPair = null;
    for (const pair of choicePairs) {
      const normalizedPair = [
        Math.min(pair[0], pair[1]),
        Math.max(pair[0], pair[1]),
      ];
      const alreadyCompared = existingComparisons.some(
        (existingPair) =>
          existingPair[0] === normalizedPair[0] &&
          existingPair[1] === normalizedPair[1]
      );

      if (!alreadyCompared) {
        nextComparisonPair = pair;
        break;
      }
    }

    if (nextComparisonPair) {
      const choice1 = choices.find((c) => c.id === nextComparisonPair[0]);
      const choice2 = choices.find((c) => c.id === nextComparisonPair[1]);

      if (choice1 && choice2) {
        res.status(200).json({
          choice1: choice1.text,
          choice2: choice2.text,
          comparisonsRemaining: remainingComparisonsCount, // Include remaining count
          totalComparisons: totalComparisonsPossible, // Include total count
        });
        return;
      } else {
        console.error(
          "Error: Choice not found for comparison pair:",
          nextComparisonPair
        );
        res.status(500).json({ error: "Internal server error." });
        return;
      }
    } else {
      res.status(204).send(); // No more comparisons available
      return;
    }
  } catch (error) {
    console.error("Error getting next comparison:", error);
    res.status(500).json({ error: "Failed to get next comparison." });
    return;
  }
};
