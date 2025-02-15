import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
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

  // Check if user has already voted
  const existingVote = await prisma.comparison.findFirst({
    where: {
      decisionId,
      userId,
    },
  });

  if (existingVote) {
    res.status(409).json({ error: "You have already voted on this decision" });
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

  // Determine the winner based on chosenOption.
  let winnerId: number | null = null;
  if (chosenOption === "choice 1") {
    // If the original order already has the lower ID as choice1, winner is choice1; otherwise, it's choice2.
    winnerId = normalizedChoice1Id === choice1Id ? choice1Id : choice2Id;
  } else if (chosenOption === "choice 2") {
    winnerId = normalizedChoice1Id === choice1Id ? choice2Id : choice1Id;
  }
  // For "skip", winnerId remains null.

  // Check if the decision exists and verify that both choices belong to it.
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

  // Create the Comparison record with userId
  try {
    await prisma.comparison.create({
      data: {
        decisionId,
        choice1Id: normalizedChoice1Id,
        choice2Id: normalizedChoice2Id,
        winnerId,
        userId,
        servedAt: new Date(),
      },
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
