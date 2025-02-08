import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const getNextComparisonHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { decisionId } = req.params;

  try {
    // Fetch the decision along with choices and comparisons.
    const decision = await prisma.decision.findUnique({
      where: { id: decisionId },
      include: {
        choices: true,
        comparisons: true,
      },
    });

    if (!decision) {
      console.warn(
        `${new Date().toISOString()} - getNextComparisonHandler - Decision not found. Decision ID: ${decisionId}`
      );
      res.status(404).json({ error: "Decision not found" });
      return;
    }

    const choices = decision.choices;
    if (!choices || choices.length < 2) {
      console.warn(
        `${new Date().toISOString()} - getNextComparisonHandler - Insufficient choices for decision. Decision ID: ${decisionId}`
      );
      res
        .status(400)
        .json({ error: "At least two choices are required for comparisons." });
      return;
    }

    // Calculate total comparisons using the formula n*(n-1)/2.
    const n = choices.length;
    const totalComparisons = (n * (n - 1)) / 2;

    // Build a set of normalized keys for already submitted comparisons.
    // We normalize a pair by always putting the smaller choice id first.
    const comparedSet = new Set<string>();
    for (const comp of decision.comparisons) {
      const id1 = Math.min(comp.choice1Id, comp.choice2Id);
      const id2 = Math.max(comp.choice1Id, comp.choice2Id);
      comparedSet.add(`${id1}-${id2}`);
    }

    // Determine how many comparisons remain.
    const comparisonsRemaining = totalComparisons - comparedSet.size;

    // Sort choices by id (or any consistent order)
    const sortedChoices = choices.sort((a, b) => a.id - b.id);
    let nextPair: {
      choice1: { id: number; text: string };
      choice2: { id: number; text: string };
    } | null = null;

    // Iterate over all possible pairs until we find one that hasn’t been compared.
    outerLoop: for (let i = 0; i < sortedChoices.length; i++) {
      for (let j = i + 1; j < sortedChoices.length; j++) {
        const key = `${sortedChoices[i].id}-${sortedChoices[j].id}`;
        if (!comparedSet.has(key)) {
          nextPair = {
            choice1: { id: sortedChoices[i].id, text: sortedChoices[i].text },
            choice2: { id: sortedChoices[j].id, text: sortedChoices[j].text },
          };
          break outerLoop;
        }
      }
    }

    // If no next pair is found, it means all comparisons are completed.
    if (!nextPair) {
      console.info(
        `${new Date().toISOString()} - getNextComparisonHandler - All comparisons completed for Decision ID: ${decisionId}`
      );
      res.status(200).json({
        message: "All comparisons completed",
        comparisonsRemaining: 0,
        totalComparisons,
      });
      return;
    }

    // Return the next comparison pair and progress info.
    res.status(200).json({
      ...nextPair,
      comparisonsRemaining,
      totalComparisons,
    });
  } catch (error) {
    console.error(
      `${new Date().toISOString()} - getNextComparisonHandler - Error retrieving next comparison for Decision ID: ${decisionId}`,
      error
    );
    res.status(500).json({ error: "Failed to retrieve next comparison" });
  }
};
