import { Response } from "express";
import { PrismaClient } from "@prisma/client";
import { update } from "../algorithms/crowdBT";
import { AuthenticatedRequest } from "../middleware/authMiddleware";

const prisma = new PrismaClient();

export const submitComparisonHandler = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { decisionId } = req.params;
  let { choice1Id, choice2Id, chosenOption } = req.body;
  const userId = req.user?.uid;

  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Validate required fields.
  if (
    choice1Id === undefined ||
    choice2Id === undefined ||
    typeof chosenOption !== "string"
  ) {
    res
      .status(400)
      .json({ error: "choice1Id, choice2Id, and chosenOption are required." });
    return;
  }

  if (!["choice 1", "choice 2", "skip"].includes(chosenOption)) {
    res.status(400).json({
      error: "chosenOption must be one of 'choice 1', 'choice 2', or 'skip'.",
    });
    return;
  }

  // Normalize the pair so that the lower ID is always first.
  const normalizedChoice1Id = Math.min(choice1Id, choice2Id);
  const normalizedChoice2Id = Math.max(choice1Id, choice2Id);

  // Check if user has already voted on this pair.
  const existingVote = await prisma.comparison.findFirst({
    where: {
      choice1Id: normalizedChoice1Id,
      choice2Id: normalizedChoice2Id,
      userId,
    },
  });

  if (existingVote) {
    res.status(409).json({ error: "You have already voted on this decision" });
    return;
  }

  // Determine winner and loser based on chosenOption.
  let winnerId: number | null = null;
  if (chosenOption === "choice 1") {
    winnerId = normalizedChoice1Id === choice1Id ? choice1Id : choice2Id;
  } else if (chosenOption === "choice 2") {
    winnerId = normalizedChoice1Id === choice1Id ? choice2Id : choice1Id;
  } else {
    res.status(200).json({ status: "skip_acknowledged" });
    return;
  }
  // because we return if winnerId is not found
  winnerId = winnerId as number;

  const loserId =
    winnerId === normalizedChoice1Id
      ? normalizedChoice2Id
      : normalizedChoice1Id;

  // Check that the decision exists and the provided choices belong to it.
  const decision = await prisma.decision.findUnique({
    where: { id: decisionId },
    include: { choices: true },
  });
  if (!decision) {
    res.status(404).json({ error: "Decision not found" });
    return;
  }
  const validChoiceIds = decision.choices.map((choice) => choice.id);
  if (
    !validChoiceIds.includes(choice1Id) ||
    !validChoiceIds.includes(choice2Id)
  ) {
    res
      .status(400)
      .json({ error: "Provided choice IDs do not belong to the decision." });
    return;
  }

  // Perform incremental updates in a transaction.
  try {
    await prisma.$transaction(async (tx) => {
      // Retrieve the current global parameters from the decision.
      const decisionRecord = await tx.decision.findUnique({
        where: { id: decisionId },
        select: { globalAlpha: true, globalBeta: true },
      });
      if (!decisionRecord) throw new Error("Decision not found");

      // Retrieve the current candidate parameters for both choices.
      const winnerCandidate = await tx.choice.findUnique({
        where: { id: winnerId },
        select: { mu: true, sigmaSq: true },
      });
      const loserCandidate = await tx.choice.findUnique({
        where: { id: loserId },
        select: { mu: true, sigmaSq: true },
      });
      if (!winnerCandidate || !loserCandidate) {
        throw new Error("One or both candidate records not found");
      }

      // Compute the updated parameters using your Crowd‑BT algorithm.
      const result = update(
        decisionRecord.globalAlpha,
        decisionRecord.globalBeta,
        winnerCandidate.mu,
        winnerCandidate.sigmaSq,
        loserCandidate.mu,
        loserCandidate.sigmaSq
      );

      // Update the candidate parameters.
      await tx.choice.update({
        where: { id: winnerId },
        data: {
          mu: result.updatedMuWinner,
          sigmaSq: result.updatedSigmaSqWinner,
        },
      });
      await tx.choice.update({
        where: { id: loserId },
        data: {
          mu: result.updatedMuLoser,
          sigmaSq: result.updatedSigmaSqLoser,
        },
      });

      // Update the decision's global parameters.
      await tx.decision.update({
        where: { id: decisionId },
        data: {
          globalAlpha: result.updatedAlpha,
          globalBeta: result.updatedBeta,
        },
      });

      // Create the comparison record.
      await tx.comparison.create({
        data: {
          decisionId,
          choice1Id: normalizedChoice1Id,
          choice2Id: normalizedChoice2Id,
          winnerId,
          userId,
          servedAt: new Date(),
        },
      });
    });

    console.info(
      `${new Date().toISOString()} - submitComparisonHandler - Comparison recorded for decision ${decisionId} (choice1Id: ${normalizedChoice1Id}, choice2Id: ${normalizedChoice2Id}, chosenOption: "${chosenOption}")`
    );
    res.status(200).json({ status: "comparison_recorded" });
  } catch (error) {
    console.error(
      `${new Date().toISOString()} - submitComparisonHandler - Error recording comparison for decision ${decisionId}`,
      error
    );
    res.status(500).json({ error: "Failed to record comparison" });
  }
};
