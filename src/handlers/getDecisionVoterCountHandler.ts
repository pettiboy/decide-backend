import { Response } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthenticatedRequest } from "../middleware/authMiddleware";

const prisma = new PrismaClient();

export const getDecisionVoterCountHandler = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { decisionId } = req.params;

  try {
    // Get the decision with its choices
    const decision = await prisma.decision.findUnique({
      where: { id: decisionId },
      include: {
        choices: true,
      },
    });

    if (!decision) {
      res.status(404).json({ error: "Decision not found" });
      return;
    }

    // Count unique users who have voted for the decision
    const numberOfVoters = await prisma.comparison.findMany({
      where: {
        decisionId,
      },
      select: {
        userId: true,
      },
      distinct: ["userId"],
    });

    res.status(200).json({
      decisionId,
      numberOfVoters,
    });
  } catch (error) {
    console.error("Error fetching voter count:", error);
    res.status(500).json({ error: "Failed to fetch voter count" });
  }
};
