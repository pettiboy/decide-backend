import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const getNextComparisonHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { decisionId } = req.params;

  // Read required comparisons per pair from query parameter, default to 1.
  const queryParam = req.query.requiredComparisonsPerPair;
  const requiredComparisonsPerPair =
    typeof queryParam === "string" && parseInt(queryParam, 10) > 0
      ? parseInt(queryParam, 10)
      : 2;

  try {
    // Fetch the decision with its choices and comparisons.
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
      res.status(400).json({
        error: "At least two choices are required for comparisons.",
      });
      return;
    }

    // Total unique pairs and total required comparisons.
    const n = choices.length;
    const requiredComparisonsPerPair = decision.requiredComparisonsPerPair || 1;
    const totalComparisons = ((n * (n - 1)) / 2) * requiredComparisonsPerPair;

    // Build a map of normalized candidate pair keys to the count of recorded comparisons.
    const comparedMap = new Map<string, number>();
    for (const comp of decision.comparisons) {
      // Use the normalized order.
      const id1 = Math.min(comp.choice1Id, comp.choice2Id);
      const id2 = Math.max(comp.choice1Id, comp.choice2Id);
      const key = `${id1}-${id2}`;
      const currentCount = comparedMap.get(key) || 0;
      comparedMap.set(key, currentCount + 1);
    }

    // Prepare sorted choices and a mapping from choice id to its index.
    const sortedChoices = [...choices].sort((a, b) => a.id - b.id);
    const idToIndex = new Map<number, number>();
    sortedChoices.forEach((choice, idx) => idToIndex.set(choice.id, idx));

    // Build the pairwise wins matrix d.
    const d: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
    for (const comp of decision.comparisons) {
      // Only count comparisons with a recorded winner.
      if (comp.winnerId !== null) {
        // Determine loser: the one that is not the winner.
        const loserId =
          comp.winnerId === comp.choice1Id ? comp.choice2Id : comp.choice1Id;
        const i = idToIndex.get(comp.winnerId);
        const j = idToIndex.get(loserId);
        if (i !== undefined && j !== undefined) {
          d[i][j] += 1;
        }
      }
    }

    // Compute the strongest path matrix p using the Schulze algorithm.
    const p: number[][] = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? 0 : d[i][j]))
    );
    for (let k = 0; k < n; k++) {
      for (let i = 0; i < n; i++) {
        if (i === k) continue;
        for (let j = 0; j < n; j++) {
          if (j === k || i === j) continue;
          p[i][j] = Math.max(p[i][j], Math.min(p[i][k], p[k][j]));
        }
      }
    }

    // Now, iterate over all possible pairs to determine:
    // 1. Total remaining comparisons.
    // 2. Which pair is most "ambiguous" (i.e. where p[i][j] === p[j][i])
    //    because additional comparisons there may help resolve cyclic issues.
    let comparisonsRemaining = 0;
    let candidatePair: {
      choice1: { id: number; text: string };
      choice2: { id: number; text: string };
      ambiguity: number; // lower means more ambiguous (fewer votes cast)
    } | null = null;

    for (let i = 0; i < sortedChoices.length; i++) {
      for (let j = i + 1; j < sortedChoices.length; j++) {
        const key = `${sortedChoices[i].id}-${sortedChoices[j].id}`;
        const currentCount = comparedMap.get(key) || 0;
        const remainingForPair = requiredComparisonsPerPair - currentCount;
        comparisonsRemaining += remainingForPair;

        // Only consider pairs that need more comparisons.
        if (currentCount < requiredComparisonsPerPair) {
          // Ambiguity criterion: if the current strongest path values are equal, extra info may help.
          const ambiguity = Math.abs(p[i][j] - p[j][i]); // if 0, they're exactly equal
          if (ambiguity === 0) {
            // If we haven't chosen one yet or if this one has fewer total votes cast,
            // choose this pair as a candidate.
            const totalVotes = d[i][j] + d[j][i];
            if (!candidatePair || totalVotes < candidatePair.ambiguity) {
              candidatePair = {
                choice1: {
                  id: sortedChoices[i].id,
                  text: sortedChoices[i].text,
                },
                choice2: {
                  id: sortedChoices[j].id,
                  text: sortedChoices[j].text,
                },
                ambiguity: totalVotes, // using total votes as a proxy here
              };
            }
          }
        }
      }
    }

    // If no ambiguous pair was found, fall back to the first incomplete pair.
    if (!candidatePair) {
      outerLoop: for (let i = 0; i < sortedChoices.length; i++) {
        for (let j = i + 1; j < sortedChoices.length; j++) {
          const key = `${sortedChoices[i].id}-${sortedChoices[j].id}`;
          const currentCount = comparedMap.get(key) || 0;
          if (currentCount < requiredComparisonsPerPair) {
            candidatePair = {
              choice1: { id: sortedChoices[i].id, text: sortedChoices[i].text },
              choice2: { id: sortedChoices[j].id, text: sortedChoices[j].text },
              ambiguity: 0,
            };
            break outerLoop;
          }
        }
      }
    }

    // If still no pair is found, then all comparisons are complete.
    if (!candidatePair) {
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

    // Return the selected next comparison pair along with progress information.
    res.status(200).json({
      ...candidatePair,
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
